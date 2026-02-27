const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pty = require('node-pty');
const os = require('os');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const unzipper = require('unzipper');
const si = require('systeminformation');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Configure Multer for dynamic uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const targetDir = req.query.targetDir || process.env.HOME || process.env.USERPROFILE;
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        cb(null, targetDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Upload endpoint
app.post('/upload', upload.array('files'), (req, res) => {
    res.json({ success: true, message: 'Files uploaded successfully' });
});

// Workspace Import endpoint (ZIP)
app.post('/upload-workspace', upload.single('workspaceZip'), async (req, res) => {
    try {
        const targetDir = req.query.targetDir || process.env.HOME;
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        const zipPath = req.file.path;
        await fs.createReadStream(zipPath)
            .pipe(unzipper.Extract({ path: targetDir }))
            .promise();

        // Cleanup the zip file after extraction
        fs.unlinkSync(zipPath);
        res.json({ success: true, message: 'Workspace imported and extracted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Download endpoint
app.get('/download', (req, res) => {
    const filePath = req.query.path;
    if (filePath && fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send('File not found');
    }
});

// Broadcast system stats every 3 seconds
setInterval(async () => {
    try {
        const mem = await si.mem();
        const currentLoad = await si.currentLoad();
        io.emit('sys.stats', {
            cpu: currentLoad.currentLoad.toFixed(1),
            memUsed: (mem.active / 1024 / 1024 / 1024).toFixed(2),
            memTotal: (mem.total / 1024 / 1024 / 1024).toFixed(2),
            memPercent: ((mem.active / mem.total) * 100).toFixed(1)
        });
    } catch (error) {
        console.error('Error fetching system stats:', error);
    }
}, 3000);

// Store PTY processes globally to survive socket disconnects
// Key: tabId, Value: { pty, lastSeen }
const globalPtyProcesses = new Map();

// Cleanup orphaned processes every minute
setInterval(() => {
    const now = Date.now();
    for (const [id, proc] of globalPtyProcesses) {
        if (now - proc.lastSeen > 300000) { // 5 minutes timeout
            console.log(`[!] Killing orphaned PTY: ${id}`);
            proc.pty.kill();
            globalPtyProcesses.delete(id);
        }
    }
}, 60000);

io.on('connection', (socket) => {
    console.log(`[+] Client connected: ${socket.id}`);

    // Determine the shell based on the operating system
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

    let currentCwd = process.env.HOME || process.env.USERPROFILE;

    // Helper to spawn/respawn the terminal
    const spawnTerminal = (tabId = 'default') => {
        if (globalPtyProcesses.has(tabId)) {
            globalPtyProcesses.get(tabId).pty.kill();
        }

        // Ensure /usr/local/bin is in the PATH for spawned processes (critical for Ollama)
        const env = { ...process.env };
        if (!env.PATH.includes('/usr/local/bin')) {
            env.PATH = `${env.PATH}:/usr/local/bin`;
        }

        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-color',
            cols: 80,
            rows: 24,
            cwd: currentCwd,
            env: env
        });

        const procData = { pty: ptyProcess, lastSeen: Date.now() };
        globalPtyProcesses.set(tabId, procData);

        ptyProcess.onData((data) => {
            procData.lastSeen = Date.now();
            socket.emit('terminal.incData', { tabId, data });
        });

        return ptyProcess;
    };

    // Handle data coming from the client and send it to the terminal
    socket.on('terminal.toTerm', ({ tabId, data }) => {
        const proc = globalPtyProcesses.get(tabId || 'default');
        if (proc) {
            proc.lastSeen = Date.now();
            proc.pty.write(data);
        }
    });

    // Handle terminal resize events
    socket.on('terminal.resize', ({ tabId, size }) => {
        try {
            const proc = globalPtyProcesses.get(tabId || 'default');
            if (proc) {
                proc.pty.resize(size.cols, size.rows);
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
        if (globalPtyProcesses.has(tabId)) {
            globalPtyProcesses.get(tabId).pty.kill();
            globalPtyProcesses.delete(tabId);
        }
    });

    socket.on('terminal.reattach', (tabIds) => {
        tabIds.forEach(tabId => {
            if (globalPtyProcesses.has(tabId)) {
                const proc = globalPtyProcesses.get(tabId);
                proc.lastSeen = Date.now();
                // Re-bind the onData listener to the NEW socket
                proc.pty.removeAllListeners('data');
                proc.pty.onData((data) => {
                    proc.lastSeen = Date.now();
                    socket.emit('terminal.incData', { tabId, data });
                });
                socket.emit('terminal.incData', { tabId, data: '\r\n\x1b[33m[System] Re-attached to session\x1b[0m\r\n' });
            } else {
                spawnTerminal(tabId);
            }
        });
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

            let items;
            try {
                items = fs.readdirSync(dirPath, { withFileTypes: true });
            } catch (err) {
                return socket.emit('fs.list.response', { error: `Permission denied or cannot read directory: ${err.message}`, path: dirPath, folders: [] });
            }

            const folders = items
                .filter(item => item.isDirectory())
                .map(item => ({
                    name: item.name,
                    path: path.join(dirPath, item.name),
                    type: 'directory'
                }));

            const files = items
                .filter(item => !item.isDirectory())
                .map(item => {
                    let size = -1;
                    try {
                        size = fs.statSync(path.join(dirPath, item.name)).size;
                    } catch (statErr) {
                        // Ignore stat errors for locked/system files
                    }
                    return {
                        name: item.name,
                        path: path.join(dirPath, item.name),
                        type: 'file',
                        size: size
                    };
                });

            // Sort alphabetically
            folders.sort((a, b) => a.name.localeCompare(b.name));
            files.sort((a, b) => a.name.localeCompare(b.name));

            socket.emit('fs.list.response', { path: dirPath, folders, files });
        } catch (error) {
            socket.emit('fs.list.response', { error: error.message, path: targetPath, folders: [], files: [] });
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

    // --- Agent Management ---
    const AGENTS_DIR = path.join(__dirname, 'agents');
    if (!fs.existsSync(AGENTS_DIR)) fs.mkdirSync(AGENTS_DIR);

    socket.on('agents.list', () => {
        try {
            const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.json'));
            const agents = files.map(f => {
                const content = fs.readFileSync(path.join(AGENTS_DIR, f), 'utf-8');
                return JSON.parse(content);
            });
            socket.emit('agents.list.response', agents);
        } catch (error) {
            console.error('Error listing agents:', error);
            socket.emit('agents.list.response', []);
        }
    });

    socket.on('agents.create', (agent) => {
        try {
            const fileName = `${agent.name.toLowerCase().replace(/\s+/g, '-')}.json`;
            fs.writeFileSync(path.join(AGENTS_DIR, fileName), JSON.stringify(agent, null, 2));
            socket.emit('agents.create.response', { success: true });
            // Re-broadcast list to all? For now just to the sender
        } catch (error) {
            socket.emit('agents.create.response', { success: false, error: error.message });
        }
    });

    socket.on('agents.delete', (agentName) => {
        try {
            const fileName = `${agentName.toLowerCase().replace(/\s+/g, '-')}.json`;
            const filePath = path.join(AGENTS_DIR, fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            socket.emit('agents.delete.response', { success: true });
        } catch (error) {
            socket.emit('agents.delete.response', { success: false, error: error.message });
        }
    });

    // --- Git Integration ---
    socket.on('fs.gitClone', ({ url, destination }) => {
        const { exec } = require('child_process');
        // If destination is somehow not provided, default to workspace
        const targetPath = destination || process.cwd();

        exec(`git clone ${url}`, { cwd: targetPath }, (error, stdout, stderr) => {
            if (error) {
                return socket.emit('fs.gitClone.response', { success: false, error: stderr || error.message });
            }
            socket.emit('fs.gitClone.response', { success: true, output: stdout || stderr });
        });
    });

    // --- Auth Verification ---
    socket.on('auth.checkStatus', () => {
        const { exec } = require('child_process');
        const userProfile = process.env.HOME || process.env.USERPROFILE;
        const results = {
            github: false,
            claude: false,
            gemini: false
        };

        // 1. Check GitHub (Check hosts.yml existence)
        const ghPath = path.join(userProfile, '.config', 'gh', 'hosts.yml');
        if (fs.existsSync(ghPath)) {
            results.github = true;
        }

        // 2. Check Claude (Check .claude.json or anthropic config)
        const claudePath = path.join(userProfile, '.claude.json');
        const anthropicPath = path.join(userProfile, '.anthropic');
        if (fs.existsSync(claudePath) || fs.existsSync(anthropicPath)) {
            results.claude = true;
        }

        // 3. Check Gemini
        const geminiCredsPath = path.join(userProfile, '.gemini', 'credentials');
        const googleConfigPath = path.join(userProfile, '.config', 'google-genai');
        if (fs.existsSync(geminiCredsPath) || fs.existsSync(googleConfigPath)) {
            results.gemini = true;
        }

        // We can do a quick async check for gh auth status just in case the file config didn't work.
        // We'll return the immediate file-based results first to make the UI snappy, then maybe 
        // they can be enhanced later.
        socket.emit('auth.checkStatus.response', results);
    });

    // --- Ollama Model Management ---
    socket.on('ollama.rmModel', (modelName) => {
        const { exec } = require('child_process');
        const execOptions = {
            env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin` }
        };
        exec(`ollama rm ${modelName}`, execOptions, (error, stdout, stderr) => {
            if (error) {
                return socket.emit('ollama.rmModel.response', { success: false, error: stderr || error.message });
            }
            socket.emit('ollama.rmModel.response', { success: true });
        });
    });

    socket.on('ollama.listModels', () => {
        const { exec } = require('child_process');
        // Inject /usr/local/bin specifically for this exec call
        const execOptions = {
            env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin` }
        };

        exec('ollama list', execOptions, (error, stdout, stderr) => {
            if (error) {
                return socket.emit('ollama.listModels.response', { success: false, models: [] });
            }

            const lines = stdout.trim().split('\n').slice(1); // Skip header
            const models = lines.map(line => {
                const parts = line.split(/\s+/);
                return parts[0]; // The NAME column
            }).filter(name => name);

            socket.emit('ollama.listModels.response', { success: true, models });
        });
    });

    socket.on('fs.readFile', (filePath) => {
        try {
            if (!fs.existsSync(filePath)) {
                return socket.emit('fs.readFile.response', { error: 'File does not exist' });
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            socket.emit('fs.readFile.response', { path: filePath, content });
        } catch (error) {
            socket.emit('fs.readFile.response', { error: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] Client disconnected: ${socket.id}`);
        // Session survives for 5 minutes (via global cleanup interval)
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
