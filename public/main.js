document.addEventListener('DOMContentLoaded', () => {
    // Initialize Socket.io
    const socket = io();

    // UI Elements
    const terminalContainer = document.getElementById('terminal-container');
    const tabsContainer = document.getElementById('terminal-tabs');
    const btnAddTab = document.getElementById('btn-add-tab');
    const statusDot = document.querySelector('.dot');
    const statusText = document.querySelector('.status-text');

    // --- UI Interactions ---
    const workspaceContainer = document.querySelector('.workspace-container');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');

    btnToggleSidebar.onclick = () => {
        workspaceContainer.classList.toggle('sidebar-active');
        // Trigger resize after transition
        setTimeout(() => {
            const active = terminals.get(activeTabId);
            if (active) {
                active.fitAddon.fit();
                socket.emit('terminal.resize', { tabId: activeTabId, size: { cols: active.term.cols, rows: active.term.rows } });
            }
        }, 350);
    };

    // Close sidebar on mobile when clicking terminal
    terminalContainer.onclick = () => {
        if (window.innerWidth <= 768 && workspaceContainer.classList.contains('sidebar-active')) {
            workspaceContainer.classList.remove('sidebar-active');
        }
    };

    // --- Tab Management State ---
    const terminals = new Map(); // tabId -> { term, fitAddon, element }
    let activeTabId = 'default';

    const createTerminalInstance = (tabId, title = 'Terminal') => {
        // Create UI for Tab
        const tabEl = document.createElement('div');
        tabEl.className = `tab ${tabId === activeTabId ? 'active' : ''}`;
        tabEl.dataset.tabId = tabId;
        tabEl.innerHTML = `
            <span class="tab-title">${title}</span>
            <button class="tab-close-btn">&times;</button>
        `;
        
        // Tab click to switch
        tabEl.onclick = (e) => {
            if (e.target.classList.contains('tab-close-btn')) return;
            switchTab(tabId);
        };

        // Tab close
        tabEl.querySelector('.tab-close-btn').onclick = (e) => {
            e.stopPropagation();
            closeTab(tabId);
        };

        tabsContainer.appendChild(tabEl);

        // Create Terminal DOM
        const termWrapper = document.createElement('div');
        termWrapper.className = `terminal-wrapper ${tabId === activeTabId ? 'active' : ''}`;
        termWrapper.id = `wrapper-${tabId}`;
        
        const termEl = document.createElement('div');
        termEl.className = 'terminal-instance';
        termWrapper.appendChild(termEl);
        terminalContainer.appendChild(termWrapper);

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
                black: '#000000', red: '#ff5f56', green: '#27c93f', yellow: '#ffbd2e',
                blue: '#2176ff', magenta: '#ff5086', cyan: '#00c1e4', white: '#e2e8f0',
                brightBlack: '#686868', brightRed: '#ff5f56', brightGreen: '#27c93f',
                brightYellow: '#ffbd2e', brightBlue: '#2176ff', brightMagenta: '#ff5086',
                brightCyan: '#00c1e4', brightWhite: '#ffffff'
            }
        });

        const fitAddon = new window.FitAddon.FitAddon();
        term.loadAddon(fitAddon);

        const webLinksAddon = new window.WebLinksAddon.WebLinksAddon((event, uri) => {
            window.open(uri, '_blank');
        });
        term.loadAddon(webLinksAddon);

        term.open(termEl);

        // Store instance
        terminals.set(tabId, { term, fitAddon, element: termWrapper, tabEl });

        // Handle events
        term.onData((data) => {
            socket.emit('terminal.toTerm', { tabId, data });
        });

        // Initial Resize
        setTimeout(() => {
            fitAddon.fit();
            socket.emit('terminal.resize', { tabId, size: { cols: term.cols, rows: term.rows } });
        }, 100);

        return term;
    };

    const switchTab = (tabId) => {
        if (!terminals.has(tabId)) return;

        // Update UI
        terminals.forEach((data, id) => {
            data.element.classList.toggle('active', id === tabId);
            data.tabEl.classList.toggle('active', id === tabId);
        });

        activeTabId = tabId;
        const { term, fitAddon } = terminals.get(tabId);
        
        // Refocus and refit
        setTimeout(() => {
            fitAddon.fit();
            term.focus();
            socket.emit('terminal.resize', { tabId, size: { cols: term.cols, rows: term.rows } });
        }, 50);
    };

    const closeTab = (tabId) => {
        if (tabId === 'default' && terminals.size === 1) return; // Don't close last tab
        
        const data = terminals.get(tabId);
        if (data) {
            data.term.dispose();
            data.element.remove();
            data.tabEl.remove();
            terminals.delete(tabId);
            socket.emit('terminal.closeTab', tabId);

            if (activeTabId === tabId) {
                const nextTabId = terminals.keys().next().value;
                switchTab(nextTabId);
            }
        }
    };

    btnAddTab.onclick = () => {
        const id = 'tab-' + Math.random().toString(36).substr(2, 9);
        socket.emit('terminal.createTab', id);
        createTerminalInstance(id, `Chat ${terminals.size + 1}`);
        switchTab(id);
    };

    // Initial setup: Clear existing and create default
    tabsContainer.innerHTML = '';
    createTerminalInstance('default', 'Main Terminal');

    // Handle Resize
    window.addEventListener('resize', () => {
        const active = terminals.get(activeTabId);
        if (active) {
            active.fitAddon.fit();
            socket.emit('terminal.resize', { tabId: activeTabId, size: { cols: active.term.cols, rows: active.term.rows } });
        }
    });

    // --- Socket Events --- //

    socket.on('terminal.incData', ({ tabId, data }) => {
        const instance = terminals.get(tabId);
        if (instance) {
            instance.term.write(data);
        }
    });

    socket.on('connect', () => {
        statusDot.className = 'dot online';
        statusText.textContent = 'Connected';
    });

    socket.on('disconnect', () => {
        statusDot.className = 'dot offline';
        statusText.textContent = 'Disconnected';
    });

    // --- Quick Action Buttons --- //
    const assignedPaths = {
        gemini: localStorage.getItem('ai-workspace-gemini') || '',
        claude: localStorage.getItem('ai-workspace-claude') || ''
    };

    if (assignedPaths.gemini) document.getElementById('input-gemini-path').value = assignedPaths.gemini;
    if (assignedPaths.claude) document.getElementById('input-claude-path').value = assignedPaths.claude;

    const sendCommand = (cmd) => {
        socket.emit("terminal.toTerm", { tabId: activeTabId, data: cmd + "\r" });
        const active = terminals.get(activeTabId);
        if (active) active.term.focus();

        // Simulate activity in the usage bars
        const activeTabEl = document.querySelector(".tab.active .tab-title");
        const title = activeTabEl ? activeTabEl.textContent.toLowerCase() : "";
        
        if (title.includes("gemini")) {
            if (title.includes("gemini-3") || title.includes("(3")) {
                updateUsageBar("gemini-3", 20);
            } else if (title.includes("gemini-2.5") || title.includes("(2.5")) {
                updateUsageBar("gemini-2.5", 15);
            }
        } else if (title.includes("claude") || title.includes("ollama")) {
            updateUsageBar("claude", 25);
        }
    };

    const updateUsageBar = (type, increment) => {
        const fill = document.getElementById(`usage-${type}`);
        if (fill) {
            let width = parseInt(fill.style.width) || 0;
            width = Math.min(100, width + increment);
            fill.style.width = width + '%';
            
            // Slowly drain over time
            setTimeout(() => {
                let currentWidth = parseInt(fill.style.width) || 0;
                fill.style.width = Math.max(0, currentWidth - 5) + '%';
            }, 5000);
        }
    };

    // Helper to start AI in a specific tab
    const startAI = (aiName, path, color, model = null) => {
        const id = `${aiName}-${Math.random().toString(36).substr(2, 5)}`;
        const baseTitle = aiName.charAt(0).toUpperCase() + aiName.slice(1);
        const title = model ? `${baseTitle} (${model})` : baseTitle;
        
        socket.emit('terminal.createTab', id);
        const term = createTerminalInstance(id, title);
        switchTab(id);

        setTimeout(() => {
            if (path) {
                socket.emit('terminal.toTerm', { tabId: id, data: `cd "${path}"\r` });
                const cmd = (model && model !== '') ? `${aiName} -m ${model}\r` : `${aiName}\r`;
                setTimeout(() => socket.emit('terminal.toTerm', { tabId: id, data: cmd }), 200);
            } else {
                const cmd = (model && model !== '') ? `${aiName} -m ${model}\r` : `${aiName}\r`;
                socket.emit('terminal.toTerm', { tabId: id, data: cmd });
            }
        }, 500);
    };

    document.getElementById('btn-gemini').addEventListener('click', () => {
        const model = document.getElementById('gemini-model-select').value;
        startAI('gemini', assignedPaths.gemini, 'gemini', model);
    });

    document.getElementById('btn-claude').addEventListener('click', () => {
        startAI('claude', assignedPaths.claude, 'claude');
    });

    // --- Local LLM (Ollama) Logic ---
    document.getElementById('btn-run-local').addEventListener('click', () => {
        let model = document.getElementById('local-model-select').value;
        if (model === 'custom') {
            model = prompt("Enter the Ollama model name (e.g., deepseek-r1:32b):");
            if (!model) return;
        }
        const id = `ollama-${Math.random().toString(36).substr(2, 5)}`;
        socket.emit('terminal.createTab', id);
        createTerminalInstance(id, `Ollama: ${model}`);
        switchTab(id);

        setTimeout(() => {
            socket.emit('terminal.toTerm', { tabId: id, data: `ollama run ${model}\r` });
        }, 500);
    });

    document.getElementById('btn-pull-local').addEventListener('click', () => {
        let model = document.getElementById('local-model-select').value;
        if (model === 'custom') {
            model = prompt("Enter the Ollama model name to pull (e.g., deepseek-r1:32b):");
            if (!model) return;
        }
        const id = `ollama-pull-${Math.random().toString(36).substr(2, 5)}`;
        socket.emit('terminal.createTab', id);
        createTerminalInstance(id, `Pulling: ${model}`);
        switchTab(id);

        setTimeout(() => {
            socket.emit('terminal.toTerm', { tabId: id, data: `ollama pull ${model}\r` });
        }, 500);
    });

    document.getElementById('btn-commit').addEventListener('click', () => {
        const activeTabEl = document.querySelector('.tab.active .tab-title');
        const title = activeTabEl ? activeTabEl.textContent.toLowerCase() : '';
        
        if (title.includes('gemini') || title.includes('claude')) {
            sendCommand('Please update the GEMINI.md file in this workspace to reflect our current progress, any new mandates, and the updated project context.');
        } else {
            alert("Switch to a Gemini or Claude tab first!");
        }
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        sendCommand('clear');
    });

    // --- Workspace Explorer Logic --- //
    const settingsModal = document.getElementById('settings-modal');
    const inputBrowserPath = document.getElementById('input-browser-path');
    const browserList = document.getElementById('browser-list');
    const inputNewFolder = document.getElementById('input-new-folder');
    let currentBrowserPath = '';

    const loadDirectory = (dirPath) => { socket.emit('fs.list', dirPath); };

    socket.on('fs.list.response', (data) => {
        if (data.error) return;
        currentBrowserPath = data.path;
        inputBrowserPath.value = currentBrowserPath;
        browserList.innerHTML = '';
        data.folders.forEach(folder => {
            const div = document.createElement('div');
            div.className = 'browser-item';
            div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg> ${folder.name}`;
            div.onclick = () => loadDirectory(folder.path);
            browserList.appendChild(div);
        });
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
        settingsModal.classList.add('active');
        if (!currentBrowserPath) loadDirectory('');
    });
    document.getElementById('btn-close-settings').addEventListener('click', () => {
        settingsModal.classList.remove('active');
        const active = terminals.get(activeTabId);
        if (active) active.term.focus();
    });

    document.getElementById('btn-up-dir').addEventListener('click', () => {
        if (currentBrowserPath) {
            const parts = currentBrowserPath.replace(/\\/g, '/').replace(/\/$/, '').split('/');
            parts.pop();
            loadDirectory(parts.join('/') || '/');
        }
    });

    document.getElementById('btn-create-folder').addEventListener('click', () => {
        const folderName = inputNewFolder.value.trim();
        if (folderName && currentBrowserPath) socket.emit('fs.createDir', { parentPath: currentBrowserPath, folderName });
    });

    socket.on('fs.createDir.response', (data) => {
        if (data.success) { inputNewFolder.value = ''; loadDirectory(data.newPath); }
    });

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

    // --- Upload & Generated Content Logic ---
    const btnUpload = document.getElementById('btn-upload');
    const inputUpload = document.getElementById('input-upload');
    const btnGenerated = document.getElementById('btn-generated');
    const generatedModal = document.getElementById('generated-modal');
    const generatedList = document.getElementById('generated-list');
    const btnCloseGenerated = document.getElementById('btn-close-generated');

    btnUpload.onclick = () => {
        inputUpload.click();
    };

    inputUpload.onchange = async () => {
        if (!inputUpload.files.length) return;
        
        const targetDir = currentBrowserPath || assignedPaths.gemini || '';
        if (!targetDir) {
            alert("Please select or assign a workspace folder first!");
            return;
        }

        const formData = new FormData();
        for (const file of inputUpload.files) {
            formData.append('files', file);
        }

        try {
            const resp = await fetch(`/upload?targetDir=${encodeURIComponent(targetDir)}`, {
                method: 'POST',
                body: formData
            });
            const result = await resp.json();
            if (result.success) {
                alert("Upload successful!");
                inputUpload.value = '';
                loadDirectory(targetDir); // Refresh view

                // Automatically mention the file in the terminal
                const fileNames = Array.from(inputUpload.files).map(f => f.name).join(', ');
                socket.emit("terminal.toTerm", { tabId: activeTabId, data: fileNames });
            }
        } catch (err) {
            console.error("Upload failed:", err);
            alert("Upload failed.");
        }
    };

    btnGenerated.onclick = () => {
        const workspace = currentBrowserPath || assignedPaths.gemini || '';
        if (!workspace) {
            alert("Select a workspace first!");
            return;
        }
        socket.emit('fs.listGenerated', workspace);
        generatedModal.classList.add('active');
    };

    btnCloseGenerated.onclick = () => {
        generatedModal.classList.remove('active');
    };

    socket.on('fs.listGenerated.response', (data) => {
        if (data.error) {
            generatedList.innerHTML = `<div class="help-text">Error: ${data.error}</div>`;
            return;
        }
        
        generatedList.innerHTML = '';
        if (data.files.length === 0) {
            generatedList.innerHTML = `<div class="help-text">No generated files found in ${data.path}</div>`;
            return;
        }

        data.files.forEach(file => {
            const div = document.createElement('div');
            div.className = 'browser-item';
            div.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                <div style="flex: 1; display: flex; justify-content: space-between; align-items: center;">
                    <span>${file.name}</span>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="action-btn small secondary" onclick="socket.emit('terminal.toTerm', { tabId: activeTabId, data: '${file.name}' }); generatedModal.classList.remove('active');">Mention</button>
                        <button class="action-btn small primary" onclick="window.location.href='/download?path=${encodeURIComponent(file.path)}'">Download</button>
                    </div>
                </div>
            `;
            generatedList.appendChild(div);
        });
    });

    document.getElementById('btn-restart-term').addEventListener('click', () => {
        socket.emit('terminal.restart', activeTabId);
        settingsModal.classList.remove('active');
    });

    // --- Agent Management Logic ---
    const agentModal = document.getElementById('agent-modal');
    const agentsListEl = document.getElementById('agents-list');
    const btnAddAgent = document.getElementById('btn-add-agent');
    const btnCloseAgent = document.getElementById('btn-close-agent');
    const btnSaveAgent = document.getElementById('btn-save-agent');

    const inputAgentName = document.getElementById('input-agent-name');
    const selectAgentModel = document.getElementById('select-agent-model');
    const inputAgentPrompt = document.getElementById('input-agent-prompt');

    const loadAgents = () => {
        socket.emit('agents.list');
    };

    btnAddAgent.onclick = () => {
        agentModal.classList.add('active');
    };

    btnCloseAgent.onclick = () => {
        agentModal.classList.remove('active');
    };

    btnSaveAgent.onclick = () => {
        const name = inputAgentName.value.trim();
        const model = selectAgentModel.value;
        const prompt = inputAgentPrompt.value.trim();

        if (name && prompt) {
            socket.emit('agents.create', { name, model, prompt });
        } else {
            alert('Please provide both a name and instructions.');
        }
    };

    socket.on('agents.create.response', (data) => {
        if (data.success) {
            agentModal.classList.remove('active');
            inputAgentName.value = '';
            inputAgentPrompt.value = '';
            loadAgents();
        } else {
            alert('Error creating agent: ' + data.error);
        }
    });

    socket.on('agents.list.response', (agents) => {
        agentsListEl.innerHTML = '';
        agents.forEach(agent => {
            const div = document.createElement('div');
            div.className = 'agent-item';
            div.innerHTML = `
                <div class="agent-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2Z"/><path d="M12 12 2.1 12.1"/><path d="m4.5 9 1.4 1.4"/><path d="M12 12V2a10 10 0 0 0-8.7 5.5"/></svg>
                </div>
                <div class="agent-info">
                    <span class="agent-name">${agent.name}</span>
                    <span class="agent-model">${agent.model}</span>
                </div>
                <button class="agent-delete-btn icon-btn" title="Delete Agent">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            `;
            
            div.onclick = (e) => {
                if (e.target.closest('.agent-delete-btn')) {
                    if (confirm(`Are you sure you want to delete "${agent.name}"?`)) {
                        socket.emit('agents.delete', agent.name);
                    }
                    return;
                }
                launchAgent(agent);
            };

            agentsListEl.appendChild(div);
        });
    });

    socket.on('agents.delete.response', (data) => {
        if (data.success) {
            loadAgents();
        }
    });

    const launchAgent = (agent) => {
        const id = `agent-${Math.random().toString(36).substr(2, 5)}`;
        const title = agent.name;
        
        socket.emit('terminal.createTab', id);
        const term = createTerminalInstance(id, id === activeTabId ? title : title); // Fix potential title issue
        switchTab(id);

        const aiName = agent.model === 'claude' ? 'claude' : 'gemini';
        const modelArg = (agent.model && agent.model !== '' && agent.model !== 'claude') ? ` -m ${agent.model}` : '';
        const path = assignedPaths[aiName];

        setTimeout(() => {
            if (path) {
                socket.emit('terminal.toTerm', { tabId: id, data: `cd "${path}"\r` });
                setTimeout(() => {
                    socket.emit('terminal.toTerm', { tabId: id, data: `${aiName}${modelArg}\r` });
                    // Prime with system prompt
                    setTimeout(() => {
                        const primeCmd = `System Instruction: ${agent.prompt}\r`;
                        socket.emit('terminal.toTerm', { tabId: id, data: primeCmd });
                    }, 2000);
                }, 200);
            } else {
                socket.emit('terminal.toTerm', { tabId: id, data: `${aiName}${modelArg}\r` });
                // Prime with system prompt
                setTimeout(() => {
                    const primeCmd = `System Instruction: ${agent.prompt}\r`;
                    socket.emit('terminal.toTerm', { tabId: id, data: primeCmd });
                }, 2000);
            }
        }, 500);
    };

    // Initial load
    loadAgents();
});
