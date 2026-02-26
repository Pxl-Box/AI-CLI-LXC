const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pty = require('node-pty');
const os = require('os');
const path = require('path');

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
    let ptyProcess = null;

    // Helper to spawn/respawn the terminal
    const spawnTerminal = () => {
        if (ptyProcess) {
            ptyProcess.kill();
        }
        ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-color',
            cols: 80,
            rows: 24,
            cwd: currentCwd,
            env: process.env
        });

        ptyProcess.onData((data) => {
            socket.emit('terminal.incData', data);
        });
    };

    // Initial spawn
    spawnTerminal();

    // Handle data coming from the client and send it to the terminal
    socket.on('terminal.toTerm', (data) => {
        if (ptyProcess) {
            ptyProcess.write(data);
        }
    });

    // Handle terminal resize events
    socket.on('terminal.resize', (size) => {
        try {
            if (ptyProcess) {
                ptyProcess.resize(size.cols, size.rows);
            }
        } catch (error) {
            console.error('Error resizing terminal:', error);
        }
    });

    // --- Workspace Settings Hooks ---
    socket.on('terminal.changeCwd', (newPath) => {
        currentCwd = newPath;
        spawnTerminal();
        socket.emit('terminal.incData', `\r\n\x1b[32m[System] Terminal restarted in: ${newPath}\x1b[0m\r\n`);
    });

    socket.on('terminal.restart', () => {
        spawnTerminal();
        socket.emit('terminal.incData', '\r\n\x1b[33m[System] Terminal Force Restarted\x1b[0m\r\n');
    });

    socket.on('disconnect', () => {
        console.log(`[-] Client disconnected: ${socket.id}`);
        if (ptyProcess) {
            ptyProcess.kill();
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
