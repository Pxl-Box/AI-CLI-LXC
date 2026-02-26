document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const terminalContainer = document.getElementById('terminal-container');
    const statusDot = document.querySelector('.dot');
    const statusText = document.querySelector('.status-text');

    // Initialize Socket.io
    const socket = io();

    // Initialize xterm.js
    const term = new window.Terminal({
        cursorBlink: true,
        macOptionIsMeta: true,
        fontFamily: '"Fira Code", monospace',
        fontSize: 14,
        theme: {
            background: '#000000',
            foreground: '#e2e8f0',
            cursor: '#8b5cf6',
            cursorAccent: '#000000',
            selectionBackground: 'rgba(139, 92, 246, 0.3)',
            // Custom palette to look vibrant
            black: '#000000',
            red: '#ff5f56',
            green: '#27c93f',
            yellow: '#ffbd2e',
            blue: '#2176ff',
            magenta: '#ff5086',
            cyan: '#00c1e4',
            white: '#e2e8f0',
            brightBlack: '#686868',
            brightRed: '#ff5f56',
            brightGreen: '#27c93f',
            brightYellow: '#ffbd2e',
            brightBlue: '#2176ff',
            brightMagenta: '#ff5086',
            brightCyan: '#00c1e4',
            brightWhite: '#ffffff'
        }
    });

    // Initialize Addons
    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    // This handles clickable URLs, crucially opening _blank tabs when clicked
    // allowing OAuth login handling directly from the frontend
    const webLinksAddon = new window.WebLinksAddon.WebLinksAddon((event, uri) => {
        window.open(uri, '_blank');
    });
    term.loadAddon(webLinksAddon);

    // Open terminal in the container
    term.open(terminalContainer);

    // Fit to container using a slight delay to ensure DOM is rendered
    setTimeout(() => {
        fitAddon.fit();
        socket.emit('terminal.resize', { cols: term.cols, rows: term.rows });
    }, 50);

    // Handle Resize
    window.addEventListener('resize', () => {
        fitAddon.fit();
        socket.emit('terminal.resize', { cols: term.cols, rows: term.rows });
    });

    // --- Socket Events --- //

    // Server -> Terminal (Write incoming data)
    socket.on('terminal.incData', (data) => {
        term.write(data);
    });

    // Terminal -> Server (Send typed data)
    term.onData((data) => {
        socket.emit('terminal.toTerm', data);
    });

    // Connection Events
    socket.on('connect', () => {
        statusDot.className = 'dot online';
        statusText.textContent = 'Connected';
    });

    socket.on('disconnect', () => {
        statusDot.className = 'dot offline';
        statusText.textContent = 'Disconnected';
    });


    // --- Quick Action Buttons --- //

    const sendCommand = (cmd) => {
        socket.emit('terminal.toTerm', cmd + '\r');
        term.focus();
    };

    document.getElementById('btn-gemini').addEventListener('click', () => {
        sendCommand('gemini');
    });

    document.getElementById('btn-claude').addEventListener('click', () => {
        sendCommand('claude');
    });

    document.getElementById('btn-commit-claude').addEventListener('click', () => {
        sendCommand('/init');
    });

    document.getElementById('btn-commit-gemini').addEventListener('click', () => {
        sendCommand('/commit');
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        // Clear terminal output but also send the actual clear command to OS
        const os = navigator.userAgent.toLowerCase();
        if (os.includes('win')) {
            sendCommand('clear'); // Windows powershell sometimes accepts clear, or we can just run it
        } else {
            sendCommand('clear');
        }
    });
});
