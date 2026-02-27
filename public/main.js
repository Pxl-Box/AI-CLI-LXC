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
            
            // Update usage bars if this is the active tab
            if (tabId === activeTabId) {
                const activeTabEl = document.querySelector('.tab.active .tab-title');
                const title = activeTabEl ? activeTabEl.textContent.toLowerCase() : '';
                
                if (title.includes('gemini')) {
                    if (title.includes('3')) updateUsageBar('gemini-3', 2);
                    else if (title.includes('2.5')) updateUsageBar('gemini-2.5', 2);
                } else if (title.includes('claude')) {
                    updateUsageBar('claude', 3);
                }
            }
        }
    });

    socket.on('sys.stats', (stats) => {
        const cpuEl = document.getElementById('sys-cpu');
        const ramEl = document.getElementById('sys-ram');
        if (cpuEl) cpuEl.textContent = `CPU: ${stats.cpu}%`;
        if (ramEl) ramEl.textContent = `RAM: ${stats.memUsed}/${stats.memTotal} GB`;
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
        claude: localStorage.getItem('ai-workspace-claude') || '',
        assets: localStorage.getItem('ai-workspace-assets') || ''
    };

    if (assignedPaths.gemini) document.getElementById('input-gemini-path').value = assignedPaths.gemini;
    if (assignedPaths.claude) document.getElementById('input-claude-path').value = assignedPaths.claude;
    if (assignedPaths.assets) document.getElementById('input-asset-path').value = assignedPaths.assets;

    const sendCommand = (cmd) => {
        socket.emit("terminal.toTerm", { tabId: activeTabId, data: cmd + "\r" });
        const active = terminals.get(activeTabId);
        if (active) active.term.focus();
    };

    const usageState = {
        'gemini-3': 0,
        'gemini-2.5': 0,
        'claude': 0
    };

    const updateUsageBar = (type, increment) => {
        if (usageState.hasOwnProperty(type)) {
            usageState[type] = Math.min(100, usageState[type] + increment);
            const fill = document.getElementById(`usage-${type}`);
            if (fill) fill.style.width = usageState[type] + '%';
        }
    };

    // Global drain interval (every 2 seconds)
    setInterval(() => {
        Object.keys(usageState).forEach(type => {
            if (usageState[type] > 0) {
                usageState[type] = Math.max(0, usageState[type] - 2);
                const fill = document.getElementById(`usage-${type}`);
                if (fill) fill.style.width = usageState[type] + '%';
            }
        });
    }, 2000);

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
            model = prompt("Enter the Ollama model name (e.g., 'deepseek-r1:32b' or 'llama3:70b'):");
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
            model = prompt("Enter the Ollama model name to pull (e.g., 'deepseek-r1:32b'):");
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
        const active = terminals.get(activeTabId);
        if (active) {
            active.term.clear();
            const activeTabEl = document.querySelector('.tab.active .tab-title');
            const title = activeTabEl ? activeTabEl.textContent.toLowerCase() : '';
            
            // If it's an AI CLI, use /clear, otherwise use standard clear
            const clearCmd = (title.includes('gemini') || title.includes('claude')) ? '/clear' : 'clear';
            
            // Send command with both \r and \n to ensure execution across different shells/REPLs
            socket.emit("terminal.toTerm", { tabId: activeTabId, data: clearCmd + "\r\n" });
            active.term.focus();
        }
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

    document.getElementById('btn-assign-asset').addEventListener('click', () => {
        assignedPaths.assets = currentBrowserPath;
        localStorage.setItem('ai-workspace-assets', currentBrowserPath);
        document.getElementById('input-asset-path').value = currentBrowserPath;
    });

    // --- Upload & Workspace Explorer Logic ---
    const btnUpload = document.getElementById('btn-upload');
    const inputUpload = document.getElementById('input-upload');
    const btnGenerated = document.getElementById('btn-generated');
    const generatedModal = document.getElementById('generated-modal');
    const generatedList = document.getElementById('generated-list');
    const btnCloseGenerated = document.getElementById('btn-close-generated');
    const explorerPathEl = document.getElementById('explorer-current-path');
    const btnExplorerUp = document.getElementById('btn-explorer-up');
    const btnMentionAll = document.getElementById('btn-mention-all');
    const inputExplorerSearch = document.getElementById('input-explorer-search');

    let explorerCurrentPath = '';
    let explorerFiles = [];
    let explorerFolders = [];

    const renderExplorer = (query = '') => {
        generatedList.innerHTML = '';
        const lowerQuery = query.toLowerCase();

        const filteredFolders = explorerFolders.filter(f => f.name.toLowerCase().includes(lowerQuery));
        const filteredFiles = explorerFiles.filter(f => f.name.toLowerCase().includes(lowerQuery));

        filteredFolders.forEach(folder => {
            const div = document.createElement('div');
            div.className = 'browser-item';
            div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg> <strong>${folder.name}/</strong>`;
            div.onclick = () => openExplorer(folder.path);
            generatedList.appendChild(div);
        });

        filteredFiles.forEach(file => {
            const div = document.createElement('div');
            div.className = 'browser-item';
            div.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                <div style="flex: 1; display: flex; justify-content: space-between; align-items: center;">
                    <span>${file.name}</span>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="action-btn small secondary" onclick="socket.emit('terminal.toTerm', { tabId: activeTabId, data: 'Attached files: \"${file.name}\"\r' }); document.getElementById('generated-modal').classList.remove('active');">Mention</button>
                        <button class="action-btn small primary" onclick="window.location.href='/download?path=${encodeURIComponent(file.path)}'">Download</button>
                    </div>
                </div>
            `;
            generatedList.appendChild(div);
        });
    };

    inputExplorerSearch.oninput = (e) => {
        renderExplorer(e.target.value);
    };

    btnUpload.onclick = () => {
        inputUpload.click();
    };

    inputUpload.onchange = async () => {
        if (!inputUpload.files.length) return;
        
        const targetDir = assignedPaths.assets || currentBrowserPath || assignedPaths.gemini || '';
        if (!targetDir) {
            alert("Please select or assign a storage path first!");
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
                loadDirectory(targetDir); 

                const fileNames = Array.from(inputUpload.files).map(f => `"${f.name}"`).join(', ');
                const attachmentMsg = `Attached files: ${fileNames}\r`;
                socket.emit("terminal.toTerm", { tabId: activeTabId, data: attachmentMsg });
            }
        } catch (err) {
            console.error("Upload failed:", err);
            alert("Upload failed.");
        }
    };

    // --- ZIP Import Logic ---
    const btnImportZip = document.getElementById('btn-import-zip');
    const inputWorkspaceZip = document.getElementById('input-workspace-zip');

    btnImportZip.onclick = () => inputWorkspaceZip.click();
    inputWorkspaceZip.onchange = async () => {
        if (!inputWorkspaceZip.files[0]) return;
        const targetDir = currentBrowserPath || assignedPaths.gemini || '';
        if (!targetDir) { alert("Select a target workspace in the explorer first!"); return; }

        const formData = new FormData();
        formData.append('workspaceZip', inputWorkspaceZip.files[0]);

        try {
            btnImportZip.disabled = true;
            btnImportZip.textContent = "Extracting...";
            const resp = await fetch(`/upload-workspace?targetDir=${encodeURIComponent(targetDir)}`, {
                method: 'POST',
                body: formData
            });
            const result = await resp.json();
            if (result.success) {
                alert("Project imported successfully!");
                loadDirectory(targetDir);
                
                // Auto-mention the imported zip
                const fileName = inputWorkspaceZip.files[0].name;
                socket.emit("terminal.toTerm", { tabId: activeTabId, data: `Imported workspace from: "${fileName}"\r` });
            }
            btnImportZip.disabled = false;
            btnImportZip.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload & Extract ZIP`;
        } catch (err) {
            alert("Import failed.");
            btnImportZip.disabled = false;
        }
    };

    // --- Workspace Explorer Navigation ---
    const openExplorer = (path) => {
        explorerCurrentPath = path;
        explorerPathEl.textContent = path;
        inputExplorerSearch.value = ''; // Reset search on folder change
        socket.emit('fs.list', path);
        generatedModal.classList.add('active');
    };

    btnGenerated.onclick = () => {
        const startPath = currentBrowserPath || assignedPaths.gemini || '';
        if (!startPath) { alert("Select a workspace folder first!"); return; }
        openExplorer(startPath);
    };

    btnExplorerUp.onclick = () => {
        if (explorerCurrentPath) {
            const parts = explorerCurrentPath.replace(/\\/g, '/').replace(/\/$/, '').split('/');
            parts.pop();
            openExplorer(parts.join('/') || '/');
        }
    };

    btnMentionAll.onclick = () => {
        if (!explorerFiles.length) return;
        const names = explorerFiles.map(f => `"${f.name}"`).join(', ');
        socket.emit('terminal.toTerm', { tabId: activeTabId, data: `Attached files: ${names}\r` });
        generatedModal.classList.remove('active');
    };

    btnCloseGenerated.onclick = () => {
        generatedModal.classList.remove('active');
    };

    socket.on('fs.list.response', (data) => {
        // Shared response for both settings explorer and workspace explorer
        if (data.error) return;

        // If modal is active, populate the workspace explorer
        if (generatedModal.classList.contains('active') && data.path === explorerCurrentPath) {
            explorerFolders = data.folders || [];
            explorerFiles = data.files || [];
            renderExplorer(inputExplorerSearch.value);
            return;
        }

        // Otherwise populate the settings explorer
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
    const modalTitle = agentModal.querySelector('h3');
    let editingAgentName = null;

    const openAgentModal = (agent = null) => {
        if (agent) {
            editingAgentName = agent.name;
            modalTitle.textContent = 'Edit Agent';
            btnSaveAgent.textContent = 'Save Changes';
            inputAgentName.value = agent.name;
            selectAgentModel.value = agent.model || '';
            inputAgentPrompt.value = agent.prompt || '';
        } else {
            editingAgentName = null;
            modalTitle.textContent = 'Create New Agent';
            btnSaveAgent.textContent = 'Create Agent';
            inputAgentName.value = '';
            selectAgentModel.value = '';
            inputAgentPrompt.value = '';
        }
        agentModal.classList.add('active');
    };

    btnAddAgent.onclick = () => {
        openAgentModal();
    };

    btnCloseAgent.onclick = () => {
        agentModal.classList.remove('active');
    };

    btnSaveAgent.onclick = () => {
        const name = inputAgentName.value.trim();
        const model = selectAgentModel.value;
        const prompt = inputAgentPrompt.value.trim();

        if (name && prompt) {
            if (editingAgentName && editingAgentName !== name) {
                // If renamed, delete the old one first or handle renaming
                socket.emit('agents.delete', editingAgentName);
            }
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
                <div class="agent-actions">
                    <button class="agent-edit-btn icon-btn" title="Edit Agent">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="agent-delete-btn icon-btn" title="Delete Agent">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
            `;
            
            div.onclick = (e) => {
                if (e.target.closest('.agent-delete-btn')) {
                    if (confirm(`Are you sure you want to delete "${agent.name}"?`)) {
                        socket.emit('agents.delete', agent.name);
                    }
                    return;
                }
                if (e.target.closest('.agent-edit-btn')) {
                    openAgentModal(agent);
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
