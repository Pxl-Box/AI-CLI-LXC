const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pty = require('node-pty');
const os = require('os');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log(`[+] Client connected: ${socket.id}`);

    // Determine the shell based on the operating system
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

    let currentCwd = process.env.HOME || process.env.USERPROFILE;
    // Store multiple PTY processes keyed by a tab ID
    const ptyProcesses = new Map();

    // Helper to spawn/respawn the terminal
    const spawnTerminal = (tabId = 'default') => {
        if (ptyProcesses.has(tabId)) {
            ptyProcesses.get(tabId).kill();
        }
        
        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-color',
            cols: 80,
            rows: 24,
            cwd: currentCwd,
            env: process.env
        });

        ptyProcess.onData((data) => {
            socket.emit('terminal.incData', { tabId, data });
        });

        ptyProcesses.set(tabId, ptyProcess);
        return ptyProcess;
    };

    // Initial spawn
    spawnTerminal('default');

    // Handle data coming from the client and send it to the terminal
    socket.on('terminal.toTerm', ({ tabId, data }) => {
        const ptyProcess = ptyProcesses.get(tabId || 'default');
        if (ptyProcess) {
            ptyProcess.write(data);
        }
    });

    // Handle terminal resize events
    socket.on('terminal.resize', ({ tabId, size }) => {
        try {
            const ptyProcess = ptyProcesses.get(tabId || 'default');
            if (ptyProcess) {
                ptyProcess.resize(size.cols, size.rows);
            }
        } catch (error) {
            console.error('Error resizing terminal:', error);
        }
    });

    // --- Tab Management ---
    socket.on('terminal.createTab', (tabId) => {
        spawnTerminal(tabId);
    });

    socket.on('terminal.closeTab', (tabId) => {
        if (ptyProcesses.has(tabId)) {
            ptyProcesses.get(tabId).kill();
            ptyProcesses.delete(tabId);
        }
    });

    // --- Workspace Settings Hooks ---
    socket.on('terminal.changeCwd', (newPath) => {
        currentCwd = newPath;
        // Restarts all terminals in new CWD or just the active one? 
        // For now, let's just update the default/active logic
        spawnTerminal('default'); 
        socket.emit('terminal.incData', { tabId: 'default', data: `\r\n\x1b[32m[System] Terminal restarted in: ${newPath}\x1b[0m\r\n` });
    });

    socket.on('terminal.restart', (tabId) => {
        const id = tabId || 'default';
        spawnTerminal(id);
        socket.emit('terminal.incData', { tabId: id, data: '\r\n\x1b[33m[System] Terminal Force Restarted\x1b[0m\r\n' });
    });

    // --- File System Explorer Hooks ---
    socket.on('fs.list', (targetPath) => {
        try {
            const dirPath = targetPath || currentCwd;
            // Ensure path exists
            if (!fs.existsSync(dirPath)) {
                return socket.emit('fs.list.response', { error: 'Path does not exist', path: dirPath, folders: [] });
            }

            const items = fs.readdirSync(dirPath, { withFileTypes: true });
            const folders = items
                .filter(item => item.isDirectory())
                .map(item => ({
                    name: item.name,
                    path: path.join(dirPath, item.name)
                }));

            // Sort alphabetically
            folders.sort((a, b) => a.name.localeCompare(b.name));

            socket.emit('fs.list.response', { path: dirPath, folders });
        } catch (error) {
            socket.emit('fs.list.response', { error: error.message, path: targetPath, folders: [] });
        }
    });

    socket.on('fs.createDir', (data) => {
        try {
            const targetPath = path.join(data.parentPath, data.folderName);
            if (fs.existsSync(targetPath)) {
                return socket.emit('fs.createDir.response', { success: false, error: 'Directory already exists' });
            }
            fs.mkdirSync(targetPath, { recursive: true });
            socket.emit('fs.createDir.response', { success: true, newPath: targetPath });
        } catch (error) {
            socket.emit('fs.createDir.response', { success: false, error: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] Client disconnected: ${socket.id}`);
        for (const [id, ptyProcess] of ptyProcesses) {
            ptyProcess.kill();
        }
        ptyProcesses.clear();
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
