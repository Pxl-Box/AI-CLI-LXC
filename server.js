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
    // Default to 'bash' on Linux/macOS and 'powershell.exe' on Windows
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

    // Spawn the pty process
    const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || process.env.USERPROFILE,
        env: process.env
    });

    // Handle data coming from the terminal and send it to the client
    ptyProcess.onData((data) => {
        socket.emit('terminal.incData', data);
    });

    // Handle data coming from the client and send it to the terminal
    socket.on('terminal.toTerm', (data) => {
        ptyProcess.write(data);
    });

    // Handle terminal resize events
    socket.on('terminal.resize', (size) => {
        try {
            ptyProcess.resize(size.cols, size.rows);
        } catch (error) {
            console.error('Error resizing terminal:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] Client disconnected: ${socket.id}`);
        ptyProcess.kill();
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
