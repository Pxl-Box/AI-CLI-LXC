document.addEventListener('DOMContentLoaded', () => {
    // Initialize Socket.io
    const socket = io();

    // UI Elements
    const terminalContainer = document.getElementById('terminal-container');
    const tabsContainer = document.getElementById('terminal-tabs');
    const btnAddTab = document.getElementById('btn-add-tab');
    const statusDot = document.querySelector('.dot');
    const statusText = document.querySelector('.status-text');

    const saveTabState = () => {
        const state = Array.from(terminals.entries()).map(([id, data]) => ({
            id,
            title: data.tabEl.querySelector('.tab-title').textContent
        }));
        localStorage.setItem('terminal-tabs-state', JSON.stringify(state));
    };

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

    const btnSplitView = document.getElementById('btn-split-view');
    let isSplitView = false;
    let secondaryTabId = null;

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

        class MultiLineLinkProvider {
            constructor(term) {
                this.term = term;
            }

            provideLinks(bufferLineNumber, callback) {
                const links = [];
                const buffer = this.term.buffer.active;

                // Scan up to 3 lines up and 3 lines down from the hovered line to catch long wrapped URLs
                const startLine = Math.max(0, bufferLineNumber - 1 - 3);
                const endLine = Math.min(buffer.length - 1, bufferLineNumber - 1 + 3);

                let text = "";
                let positions = [];

                for (let i = startLine; i <= endLine; i++) {
                    const line = buffer.getLine(i);
                    if (!line) continue;

                    const str = line.translateToString(true);
                    for (let c = 0; c < str.length; c++) {
                        text += str[c];
                        positions.push({ x: c + 1, y: i + 1 });
                    }
                }

                // Relaxed regex to capture complex Auth URLs
                const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
                let match;
                while ((match = urlRegex.exec(text)) !== null) {
                    const url = match[0];
                    const startIdx = match.index;
                    const endIdx = match.index + url.length - 1;

                    const startPos = positions[startIdx];
                    const endPos = positions[endIdx];

                    let intersects = false;
                    for (let i = startIdx; i <= endIdx; i++) {
                        if (positions[i].y === bufferLineNumber) {
                            intersects = true;
                            break;
                        }
                    }

                    if (intersects) {
                        links.push({
                            range: { start: startPos, end: endPos },
                            text: url,
                            activate: (e, text) => { window.open(url, '_blank'); }
                        });
                    }
                }
                callback(links);
            }
        }

        term.registerLinkProvider(new MultiLineLinkProvider(term));

        term.open(termEl);

        // Store instance
        terminals.set(tabId, { term, fitAddon, element: termWrapper, tabEl });
        if (typeof saveTabState === 'function') saveTabState();

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

    const refreshTerminalLayout = () => {
        terminals.forEach((data, id) => {
            const isPrimary = (id === activeTabId);
            const isSecondary = (isSplitView && id === secondaryTabId);

            data.element.classList.toggle('active', isPrimary || isSecondary);
            data.element.classList.toggle('split', isSplitView && (isPrimary || isSecondary));
            data.tabEl.classList.toggle('active', isPrimary);
            data.tabEl.classList.toggle('secondary', isSecondary);

            if (isPrimary || isSecondary) {
                setTimeout(() => {
                    data.fitAddon.fit();
                    socket.emit('terminal.resize', { tabId: id, size: { cols: data.term.cols, rows: data.term.rows } });
                }, 50);
            }
        });
    };

    const switchTab = (tabId) => {
        if (!terminals.has(tabId)) return;

        if (isSplitView) {
            if (tabId !== activeTabId) {
                secondaryTabId = activeTabId;
                activeTabId = tabId;
            }
        } else {
            activeTabId = tabId;
        }

        refreshTerminalLayout();
        const active = terminals.get(activeTabId);
        if (active) active.term.focus();
    };

    btnSplitView.onclick = () => {
        isSplitView = !isSplitView;
        btnSplitView.classList.toggle('active', isSplitView);
        if (isSplitView) {
            if (!secondaryTabId || secondaryTabId === activeTabId) {
                secondaryTabId = Array.from(terminals.keys()).find(id => id !== activeTabId) || null;
            }
        }
        refreshTerminalLayout();
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
            saveTabState();

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

    // Initial setup: Restore or create default
    const savedState = localStorage.getItem('terminal-tabs-state');
    tabsContainer.innerHTML = '';

    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            if (state.length > 0) {
                state.forEach(t => createTerminalInstance(t.id, t.title));
                socket.emit('terminal.reattach', state.map(t => t.id));
            } else {
                createTerminalInstance('default', 'Main Terminal');
            }
        } catch (e) {
            console.error("Error restoring state:", e);
            createTerminalInstance('default', 'Main Terminal');
        }
    } else {
        createTerminalInstance('default', 'Main Terminal');
    }

    // Handle Resize
    window.addEventListener('resize', () => {
        if (isSplitView) {
            refreshTerminalLayout();
        } else {
            const active = terminals.get(activeTabId);
            if (active) {
                active.fitAddon.fit();
                socket.emit('terminal.resize', { tabId: activeTabId, size: { cols: active.term.cols, rows: active.term.rows } });
            }
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
        assets: localStorage.getItem('ai-workspace-assets') || '',
        generated: localStorage.getItem('ai-workspace-generated') || ''
    };

    if (assignedPaths.gemini) document.getElementById('input-gemini-path').value = assignedPaths.gemini;
    if (assignedPaths.claude) document.getElementById('input-claude-path').value = assignedPaths.claude;
    if (assignedPaths.assets) document.getElementById('input-asset-path').value = assignedPaths.assets;
    const inputGeneratedPath = document.getElementById('input-generated-path');
    if (assignedPaths.generated && inputGeneratedPath) inputGeneratedPath.value = assignedPaths.generated;

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

    // Helper to get active workspace from dropdowns
    const getActiveWorkspace = () => {
        const select1 = document.getElementById('active-workspace-select');
        const select2 = document.getElementById('settings-active-workspace-select');
        return (select1 && select1.value) || (select2 && select2.value) || null;
    };

    document.getElementById('btn-gemini').addEventListener('click', () => {
        const model = document.getElementById('gemini-model-select').value;
        const ws = getActiveWorkspace() || assignedPaths.gemini;
        startAI('gemini', ws, 'gemini', model);
    });

    document.getElementById('btn-claude').addEventListener('click', () => {
        const ws = getActiveWorkspace() || assignedPaths.claude;
        startAI('claude', ws, 'claude');
    });

    // --- Local LLM (Ollama) Logic ---
    const localModelSelect = document.getElementById('local-model-select');

    const syncLocalModels = () => {
        socket.emit('ollama.listModels');
    };

    socket.on('ollama.listModels.response', (data) => {
        const localAiList = document.getElementById('local-ai-list');
        if (localAiList) {
            localAiList.innerHTML = '';
            if (data.models.length === 0) {
                localAiList.innerHTML = '<div class="help-text" style="font-style: italic;">No local models found installed on host.</div>';
            }
        }

        if (data.success && data.models.length > 0) {
            // Keep "Custom" at the end
            const customOption = localModelSelect.querySelector('option[value="custom"]');

            // Clear existing options except maybe a "Pull new..." placeholder if we want
            localModelSelect.innerHTML = '';

            data.models.forEach(model => {
                const opt = document.createElement('option');
                opt.value = model;
                opt.textContent = model;
                localModelSelect.appendChild(opt);

                // Populate settings list
                if (localAiList) {
                    const row = document.createElement('div');
                    row.className = 'assignment-row';
                    row.innerHTML = `
                        <input type="text" readonly value="${model}" style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.5rem; color: var(--text-primary); font-family: 'Fira Code', monospace; font-size: 0.8rem;">
                        <button class="action-btn danger small" title="Delete Model">Delete</button>
                    `;
                    row.querySelector('.action-btn').addEventListener('click', () => {
                        if (confirm(`Are you sure you want to delete ${model}?`)) {
                            socket.emit('ollama.rmModel', model);
                        }
                    });
                    localAiList.appendChild(row);
                }
            });

            if (customOption) localModelSelect.appendChild(customOption);
        }
    });

    socket.on('ollama.rmModel.response', (data) => {
        if (data.success) {
            syncLocalModels(); // Refresh list after deletion
        } else {
            alert(`Error deleting model:\n${data.error}`);
        }
    });

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



    // --- Workspace Explorer Logic --- //
    const settingsModal = document.getElementById('settings-modal');
    const inputBrowserPath = document.getElementById('input-browser-path');
    const browserList = document.getElementById('browser-list'); // now a <select>
    const inputNewFolder = document.getElementById('input-new-folder');
    const newFolderRow = document.getElementById('new-folder-row');
    let currentBrowserPath = '';

    const loadDirectory = (dirPath) => { socket.emit('fs.list', dirPath); };

    // Dropdown navigation: selecting a folder navigates into it
    if (browserList) {
        browserList.addEventListener('change', () => {
            const selectedPath = browserList.value;
            if (selectedPath) {
                loadDirectory(selectedPath);
                browserList.value = ''; // reset after navigating
            }
        });
    }

    // Toggle the new-folder input row
    const btnNewFolderInline = document.getElementById('btn-new-folder-inline');
    const btnCancelFolder = document.getElementById('btn-cancel-folder');
    if (btnNewFolderInline && newFolderRow) {
        btnNewFolderInline.addEventListener('click', () => {
            newFolderRow.style.display = newFolderRow.style.display === 'none' ? 'flex' : 'none';
            if (newFolderRow.style.display === 'flex') inputNewFolder.focus();
        });
    }
    if (btnCancelFolder && newFolderRow) {
        btnCancelFolder.addEventListener('click', () => {
            newFolderRow.style.display = 'none';
            inputNewFolder.value = '';
        });
    }

    socket.on('fs.list.response', (data) => {
        if (data.error) return;
        currentBrowserPath = data.path;
        // inputBrowserPath is now a <span>
        if (inputBrowserPath) inputBrowserPath.textContent = currentBrowserPath;
        // Populate the dropdown
        if (browserList) {
            browserList.innerHTML = '<option value="">-- select folder --</option>';
            data.folders.forEach(folder => {
                const opt = document.createElement('option');
                opt.value = folder.path;
                opt.textContent = folder.name;
                browserList.appendChild(opt);
            });
        }
    });

    // --- Settings UI Tab Logic --- //
    const settingsTabs = document.querySelectorAll('.settings-tab-btn');
    const settingsPanes = document.querySelectorAll('.settings-tab-pane');

    const openSettingsTab = (tabId) => {
        settingsTabs.forEach(t => {
            t.style.borderColor = 'transparent';
            t.style.color = 'var(--text-muted)';
        });
        settingsPanes.forEach(p => p.style.display = 'none');

        const activeBtn = document.querySelector(`.settings-tab-btn[data-tab="${tabId}"]`);
        const activePane = document.getElementById(tabId);

        if (activeBtn) {
            activeBtn.style.borderColor = 'var(--brand-gemini)';
            activeBtn.style.color = 'var(--text-primary)';
        }
        if (activePane) {
            activePane.style.display = 'flex';
        }

        // Trigger specific loads
        if (tabId === 'settings-localai') {
            socket.emit('ollama.listModels');
        }
        if (tabId === 'settings-explorer') {
            // Small delay to ensure pane is visible before emitting
            setTimeout(() => loadDirectory(currentBrowserPath || ''), 50);
            if (typeof renderSavedProjects === 'function') renderSavedProjects();
        }
    };

    settingsTabs.forEach(btn => {
        btn.addEventListener('click', () => openSettingsTab(btn.getAttribute('data-tab')));
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
        settingsModal.classList.add('active');
        // Always reset to General Tab on open
        openSettingsTab('settings-general');
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
        if (data.success) {
            inputNewFolder.value = '';
            loadDirectory(data.newPath); // Navigate to the newly created folder
            // Also refresh explorer if it's open
            if (generatedModal.classList.contains('active')) {
                openExplorer(explorerCurrentPath);
            }
        }
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

    document.getElementById('btn-assign-generated').addEventListener('click', () => {
        assignedPaths.generated = currentBrowserPath;
        localStorage.setItem('ai-workspace-generated', currentBrowserPath);
        document.getElementById('input-generated-path').value = currentBrowserPath;
    });

    // --- Saved Projects Logic --- //
    const savedProjectsListEl = document.getElementById('saved-projects-list');
    let savedProjects = [];

    const loadSavedProjects = () => {
        const stored = localStorage.getItem('ai-saved-projects');
        if (stored) {
            try {
                savedProjects = JSON.parse(stored);
            } catch (e) {
                savedProjects = [];
            }
        }
        renderSavedProjects();
    };

    const saveSavedProjects = () => {
        localStorage.setItem('ai-saved-projects', JSON.stringify(savedProjects));
        renderSavedProjects();
    };

    const renderSavedProjects = () => {
        const sel = document.getElementById('saved-projects-list');
        if (!sel) return;

        // Populate projects dropdown
        sel.innerHTML = savedProjects.length === 0
            ? '<option value="">-- no projects saved --</option>'
            : savedProjects.map(p => `<option value="${p.path}">${p.name}</option>`).join('');

        // Sync active workspace dropdowns
        const activeWsSelect = document.getElementById('active-workspace-select');
        const settingsActiveWsSelect = document.getElementById('settings-active-workspace-select');
        [activeWsSelect, settingsActiveWsSelect].forEach(selectEl => {
            if (!selectEl) return;
            const currentSelection = selectEl.value;
            selectEl.innerHTML = '<option value="">Default (~)</option>' +
                savedProjects.map(p => `<option value="${p.path}">${p.name}</option>`).join('');
            if (currentSelection && savedProjects.find(p => p.path === currentSelection)) {
                selectEl.value = currentSelection;
            }
            selectEl.addEventListener('change', (e) => {
                if (activeWsSelect && activeWsSelect !== e.target) activeWsSelect.value = e.target.value;
                if (settingsActiveWsSelect && settingsActiveWsSelect !== e.target) settingsActiveWsSelect.value = e.target.value;
            });
        });
    };

    const btnSaveProject = document.getElementById('btn-save-project');
    if (btnSaveProject) {
        btnSaveProject.addEventListener('click', () => {
            if (!currentBrowserPath) { alert('Navigate to a folder first.'); return; }
            if (savedProjects.find(p => p.path === currentBrowserPath)) { alert('Already saved.'); return; }
            const defaultName = currentBrowserPath.replace(/\\/g, '/').replace(/\/$/, '').split('/').pop() || 'Root';
            const name = prompt(`Name this project (${currentBrowserPath}):`, defaultName);
            if (name) {
                savedProjects.push({ name: name.trim(), path: currentBrowserPath, added: new Date().toISOString() });
                saveSavedProjects();
            }
        });
    }

    // Load button
    const btnLoadProject = document.getElementById('btn-load-project');
    if (btnLoadProject) {
        btnLoadProject.addEventListener('click', () => {
            const sel = document.getElementById('saved-projects-list');
            if (sel && sel.value) loadDirectory(sel.value);
        });
    }

    // Delete button
    const btnDeleteProject = document.getElementById('btn-delete-project');
    if (btnDeleteProject) {
        btnDeleteProject.addEventListener('click', () => {
            const sel = document.getElementById('saved-projects-list');
            if (!sel || !sel.value) return;
            if (confirm(`Remove "${sel.options[sel.selectedIndex].text}" from saved projects?`)) {
                savedProjects = savedProjects.filter(p => p.path !== sel.value);
                saveSavedProjects();
            }
        });
    }

    // Initialize saved projects
    loadSavedProjects();

    // --- Upload & Workspace Explorer Logic ---
    const btnUpload = document.getElementById('btn-upload');
    const inputUpload = document.getElementById('input-upload');
    const btnGenerated = document.getElementById('btn-generated');
    const generatedModal = document.getElementById('generated-modal');
    const generatedList = document.getElementById('generated-list');
    const btnCloseGenerated = document.getElementById('btn-close-generated');
    const previewModal = document.getElementById('preview-modal');
    const btnClosePreview = document.getElementById('btn-close-preview');
    const previewTitle = document.getElementById('preview-title');
    const previewCode = document.getElementById('preview-code');

    const explorerPathEl = document.getElementById('explorer-current-path');
    const btnExplorerUp = document.getElementById('btn-explorer-up');
    const btnExplorerMkdir = document.getElementById('btn-explorer-mkdir');
    const btnMentionAll = document.getElementById('btn-mention-all');
    const btnMentionSelected = document.getElementById('btn-mention-selected');
    const btnGatherContext = document.getElementById('btn-gather-context');
    const selectionCountEl = document.getElementById('explorer-selection-count');
    const inputExplorerSearch = document.getElementById('input-explorer-search');

    const openPreview = (filePath) => {
        previewTitle.textContent = filePath.split('/').pop();
        previewCode.textContent = 'Loading...';
        previewModal.classList.add('active');
        socket.emit('fs.readFile', filePath);
    };

    socket.on('fs.readFile.response', (data) => {
        if (data.error) {
            previewCode.textContent = `Error: ${data.error}`;
            return;
        }

        // Detect language based on extension
        const ext = data.path.split('.').pop().toLowerCase();
        let lang = 'javascript';
        if (ext === 'css') lang = 'css';
        else if (ext === 'json') lang = 'json';
        else if (ext === 'sh' || ext === 'bash') lang = 'bash';
        else if (ext === 'md') lang = 'markdown';
        else if (ext === 'html') lang = 'markup';

        previewCode.className = `language-${lang}`;
        previewCode.textContent = data.content;

        // Trigger Prism highlighting
        if (window.Prism) {
            window.Prism.highlightElement(previewCode);
        }
    });

    btnClosePreview.onclick = () => {
        previewModal.classList.remove('active');
    };

    let explorerCurrentPath = '';
    let explorerFiles = [];
    let explorerFolders = [];
    let selectedFiles = new Set();

    const updateSelectionUI = () => {
        const count = selectedFiles.size;
        selectionCountEl.textContent = `${count} file${count !== 1 ? 's' : ''} selected`;
        btnMentionSelected.disabled = count === 0;
    };

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
            const isSelected = selectedFiles.has(file.name);
            div.innerHTML = `
                <input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} data-name="${file.name}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="min-width: 16px;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                <div style="flex: 1; display: flex; justify-content: space-between; align-items: center; min-width: 0;">
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 0.5rem;">${file.name}</span>
                    <div style="display: flex; gap: 0.25rem; flex-shrink: 0;">
                        <button class="action-btn small secondary btn-peek" style="padding: 0.2rem 0.4rem; font-size: 0.7rem;" title="Peek Content">Peek</button>
                        <button class="action-btn small secondary btn-mention" style="padding: 0.2rem 0.4rem; font-size: 0.7rem;">Mention</button>
                        <button class="action-btn small primary btn-down" style="padding: 0.2rem 0.4rem; font-size: 0.7rem;">Down</button>
                    </div>
                </div>
            `;

            const btnPeek = div.querySelector('.btn-peek');
            if (btnPeek) btnPeek.onclick = (e) => { e.stopPropagation(); openPreview(file.path.replace(/\\/g, '/')); };

            const btnMention = div.querySelector('.btn-mention');
            if (btnMention) btnMention.onclick = (e) => {
                e.stopPropagation();
                socket.emit('terminal.toTerm', { tabId: activeTabId, data: `Attached files: "${file.path.replace(/\\/g, '/')}"\r` });
                document.getElementById('generated-modal').classList.remove('active');
            };

            const btnDown = div.querySelector('.btn-down');
            if (btnDown) btnDown.onclick = (e) => {
                e.stopPropagation();
                window.location.href = `/download?path=${encodeURIComponent(file.path)}`;
            };

            // Toggle selection on click
            div.onclick = (e) => {
                if (e.target.tagName === 'BUTTON') return;
                const checkbox = div.querySelector('.file-checkbox');
                if (e.target !== checkbox) checkbox.checked = !checkbox.checked;

                if (checkbox.checked) selectedFiles.add(file.name);
                else selectedFiles.delete(file.name);
                updateSelectionUI();
            };

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

                const fileNames = Array.from(inputUpload.files).map(f => {
                    const basePath = targetDir.replace(/\\/g, '/').replace(/\/$/, '');
                    return `"${basePath}/${f.name}"`;
                }).join(', ');
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

                // Auto-save as project if not already
                if (!savedProjects.find(p => p.path === targetDir)) {
                    const defaultName = targetDir.replace(/\\/g, '/').replace(/\/$/, '').split('/').pop() || 'Imported Workspace';
                    savedProjects.push({
                        name: defaultName,
                        path: targetDir,
                        added: new Date().toISOString()
                    });
                    saveSavedProjects();
                    // Set it as active
                    const activeSelect = document.getElementById('active-workspace-select');
                    if (activeSelect) activeSelect.value = targetDir;
                }

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

    // --- Git Clone Logic ---
    const btnGitClone = document.getElementById('btn-git-clone');
    const inputGitUrl = document.getElementById('input-git-url');
    if (btnGitClone && inputGitUrl) {
        btnGitClone.addEventListener('click', () => {
            const url = inputGitUrl.value.trim();
            if (!url) { alert("Please enter a valid Git URL"); return; }

            const targetDir = currentBrowserPath || assignedPaths.gemini || '';
            if (!targetDir) { alert("Select a target workspace in the explorer first!"); return; }

            btnGitClone.disabled = true;
            btnGitClone.textContent = "Cloning...";
            socket.emit('fs.gitClone', { url, destination: targetDir });
        });

        socket.on('fs.gitClone.response', (data) => {
            btnGitClone.disabled = false;
            btnGitClone.textContent = "Clone";

            if (data.success) {
                inputGitUrl.value = '';
                alert("Repository cloned successfully!");
                const targetDir = currentBrowserPath || assignedPaths.gemini || '';
                loadDirectory(targetDir);
            } else {
                alert(`Clone failed:\n${data.error}`);
            }
        });
    }

    // --- Settings General Auth Logins ---
    const attachAuthLogin = (btnId, title, cmd) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', () => {
            const id = `auth-${Math.random().toString(36).substr(2, 5)}`;
            socket.emit('terminal.createTab', id);
            createTerminalInstance(id, title);
            switchTab(id);
            setTimeout(() => socket.emit('terminal.toTerm', { tabId: id, data: `${cmd}\r` }), 500);

            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal) settingsModal.classList.remove('active');
        });
    };

    attachAuthLogin('btn-login-gemini', 'Gemini Auth', 'gemini');
    attachAuthLogin('btn-login-claude', 'Claude Auth', 'claude');
    attachAuthLogin('btn-login-github', 'GitHub Auth', 'gh auth login');

    // --- Workspace Explorer Navigation ---
    const openExplorer = (path) => {
        explorerCurrentPath = path;
        explorerPathEl.textContent = path;
        inputExplorerSearch.value = ''; // Reset search on folder change
        selectedFiles.clear(); // Reset selection on folder change
        updateSelectionUI();
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

    btnExplorerMkdir.onclick = () => {
        const name = prompt("Enter new folder name:");
        if (name && explorerCurrentPath) {
            socket.emit('fs.createDir', { parentPath: explorerCurrentPath, folderName: name });
        }
    };

    btnGatherContext.onclick = () => {
        const smartFiles = ['gemini.md', 'server.js', 'package.json', '.env.example', 'readme.md', 'install.sh', 'setup-lxc.sh'];
        let gatheredCount = 0;

        explorerFiles.forEach(file => {
            if (smartFiles.includes(file.name.toLowerCase())) {
                selectedFiles.add(file.name);
                gatheredCount++;
            }
        });

        if (gatheredCount > 0) {
            renderExplorer(inputExplorerSearch.value);
            updateSelectionUI();
        } else {
            alert("No standard architectural files found in this folder.");
        }
    };

    btnMentionSelected.onclick = () => {
        if (selectedFiles.size === 0) return;
        const basePath = explorerCurrentPath.replace(/\\/g, '/').replace(/\/$/, '');
        const names = Array.from(selectedFiles).map(name => `"${basePath}/${name}"`).join(', ');
        socket.emit('terminal.toTerm', { tabId: activeTabId, data: `Attached files: ${names}\r` });
        generatedModal.classList.remove('active');
    };

    btnMentionAll.onclick = () => {
        if (!explorerFiles.length) return;
        const names = explorerFiles.map(f => `"${f.path.replace(/\\/g, '/')}"`).join(', ');
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
        createTerminalInstance(id, title);
        switchTab(id);

        const aiName = agent.model === 'claude' ? 'claude' : 'gemini';
        const modelArg = (agent.model && agent.model !== '' && agent.model !== 'claude') ? ` -m ${agent.model}` : '';
        const activeSelect = document.getElementById('active-workspace-select');
        const activeWs = activeSelect && activeSelect.value ? activeSelect.value : '';
        const path = activeWs || assignedPaths[aiName];

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
    syncLocalModels();
});
