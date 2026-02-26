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
        scrollback: 5000,
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

    // State tracker for which AI is active
    let activeAI = 'none';

    // --- Workspace State ---
    const assignedPaths = {
        gemini: localStorage.getItem('ai-workspace-gemini') || '',
        claude: localStorage.getItem('ai-workspace-claude') || ''
    };

    // Update UI for stored paths
    if (assignedPaths.gemini) document.getElementById('input-gemini-path').value = assignedPaths.gemini;
    if (assignedPaths.claude) document.getElementById('input-claude-path').value = assignedPaths.claude;

    const sendCommand = (cmd) => {
        socket.emit('terminal.toTerm', cmd + '\r');
        term.focus();
    };

    document.getElementById('btn-gemini').addEventListener('click', () => {
        activeAI = 'gemini';
        if (assignedPaths.gemini) {
            sendCommand(`cd "${assignedPaths.gemini}"`);
            setTimeout(() => sendCommand('gemini'), 100);
        } else {
            sendCommand('gemini');
        }
    });

    document.getElementById('btn-claude').addEventListener('click', () => {
        activeAI = 'claude';
        if (assignedPaths.claude) {
            sendCommand(`cd "${assignedPaths.claude}"`);
            setTimeout(() => sendCommand('claude'), 100);
        } else {
            sendCommand('claude');
        }
    });

    document.getElementById('btn-commit').addEventListener('click', () => {
        if (activeAI === 'gemini' || activeAI === 'claude') {
            // User requested /init for both so they share the exact same context file structure
            sendCommand('/init');
        } else {
            alert("Please start Gemini or Claude using the Launchers first!");
            term.focus();
        }
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        const os = navigator.userAgent.toLowerCase();
        if (os.includes('win')) {
            sendCommand('clear');
        } else {
            sendCommand('clear');
        }
    });

    // --- Workspace Explorer Logic --- //
    const settingsModal = document.getElementById('settings-modal');
    const inputBrowserPath = document.getElementById('input-browser-path');
    const browserList = document.getElementById('browser-list');
    const inputNewFolder = document.getElementById('input-new-folder');

    let currentBrowserPath = '';

    const loadDirectory = (dirPath) => {
        socket.emit('fs.list', dirPath);
    };

    socket.on('fs.list.response', (data) => {
        if (data.error) {
            console.error('Directory Error:', data.error);
            return;
        }

        currentBrowserPath = data.path;
        inputBrowserPath.value = currentBrowserPath;
        browserList.innerHTML = '';

        data.folders.forEach(folder => {
            const div = document.createElement('div');
            div.className = 'browser-item';
            div.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                ${folder.name}
            `;
            div.onclick = () => loadDirectory(folder.path);
            browserList.appendChild(div);
        });

        if (data.folders.length === 0) {
            browserList.innerHTML = '<div class="browser-item" style="color: #666; justify-content: center;">Empty Directory</div>';
        }
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
        settingsModal.classList.add('active');
        // Load default path on open if empty
        if (!currentBrowserPath) loadDirectory('');
    });

    document.getElementById('btn-close-settings').addEventListener('click', () => {
        settingsModal.classList.remove('active');
        term.focus();
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('active');
            term.focus();
        }
    });

    document.getElementById('btn-up-dir').addEventListener('click', () => {
        if (currentBrowserPath) {
            // Get parent path by splitting and popping
            const parts = currentBrowserPath.replace(/\\/g, '/').replace(/\/$/, '').split('/');
            parts.pop();
            const parent = parts.join('/') || '/';
            loadDirectory(parent);
        }
    });

    document.getElementById('btn-create-folder').addEventListener('click', () => {
        const folderName = inputNewFolder.value.trim();
        if (folderName && currentBrowserPath) {
            socket.emit('fs.createDir', { parentPath: currentBrowserPath, folderName });
        }
    });

    socket.on('fs.createDir.response', (data) => {
        if (data.success) {
            inputNewFolder.value = '';
            loadDirectory(data.newPath); // Automatically enter it
        } else {
            alert('Failed to create folder: ' + data.error);
        }
    });

    // Handle Assignments
    document.getElementById('btn-assign-gemini').addEventListener('click', () => {
        assignedPaths.gemini = currentBrowserPath;
        localStorage.setItem('ai-workspace-gemini', currentBrowserPath);
        document.getElementById('input-gemini-path').value = currentBrowserPath;
    });

    document.getElementById('btn-assign-claude').addEventListener('click', () => {
        assignedPaths.claude = currentBrowserPath;
        localStorage.setItem('ai-workspace-claude', currentBrowserPath);
        document.getElementById('input-claude-path').value = currentBrowserPath;
    });

    // Handle Restart Term
    document.getElementById('btn-restart-term').addEventListener('click', () => {
        socket.emit('terminal.restart');
        settingsModal.classList.remove('active');
        term.focus();
    });
});
