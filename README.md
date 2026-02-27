# AI Terminal Workspace

A sleek, modern web-based wrapper around local terminal tools, specialized for running AI CLIs like **Claude Code** and **Gemini CLI**.

This project provides a fully localized, web-accessible interface for your headless AI development environments, complete with an interactive file explorer and segregated model context tracking.

## ✨ Features

- **Full Terminal Emulator:** Native interaction using `xterm.js` and `node-pty`.
- **4-Icon Primary Actions:** Fast access to **Upload**, **Workspace Explorer**, **Commit To Memory**, and **Clear Terminal** from the header.
- **Workspace Manager:** Interactively browse files, create folders, and preview code with syntax highlighting (Prism.js).
- **Smart Model isolation:** Per-workspace asset management and custom folder assignments for AI personas.
- **Agent Hub:** Create, edit, and launch custom AI personas with specialized system prompts.
- **Advanced Persistence:** Sessions survive browser refreshes; Black Box recovery handles AI crashes.
- **Dual-Terminal Split View:** Collaborative multi-AI workflow with side-by-side terminal windows.
- **Live Ollama Sync:** Direct integration with your local LLM library.

---

## 📚 Documentation
For detailed technical architecture, file structures, and a complete user guide, see [DOCUMENTATION.md](./DOCUMENTATION.md).

---

## 🚀 Deployment to Proxmox

The absolute easiest way to deploy this is to run the automated host creation script directly from your **Proxmox Host Shell** (not inside an existing VM/LXC).

### Automatic Deployment (1-Click Install)
1. Open your Proxmox web UI.
2. Select your node (e.g., `pve`) and click **Shell**.
3. Run the following command exactly as written:

```bash
bash <(curl -s https://raw.githubusercontent.com/Pxl-Box/AI-CLI-LXC/main/proxmox-create-lxc.sh)
```

**What this script does:**
- Downloads the latest Ubuntu 24.04 template.
- Dynamically creates a new unprivileged LXC with customizable Container ID and hardware specs (Default: 2 Cores, 6GB RAM, 30GB Disk).
- **Interactive setup** with Quick Default and Custom configuration modes.
- Injects the Node.js installation, the AI CLIs, and the frontend web app.
- Configures `pm2` to automatically start and persist the web server as a background service.

Once finished, simply look at the console output for the assigned IP address and access the UI via `http://<LXC_IP>:3000`.

---

### Manual Deployment (Inside an Existing Ubuntu LXC)
If you prefer to use an existing Ubuntu 24.04 environment, SSH into your LXC as root and run:

```bash
bash <(curl -s https://raw.githubusercontent.com/Pxl-Box/AI-CLI-LXC/main/install.sh)
```

### Local Testing (Windows/Mac Desktop)
1. Open your terminal in this repository.
2. Install dependencies: `npm install`
3. Start the node server: `node server.js`
4. Open your web browser and navigate to `http://localhost:3000`. You will have a functional PowerShell/Bash session embedded.

---

### Troubleshooting
**Accidentally installed on your Proxmox Host?**
If you mistakenly ran the `install.sh` in the Proxmox structural shell rather than an LXC, run the cleanup script to remove Node.js and the project files:
```bash
bash <(curl -s https://raw.githubusercontent.com/Pxl-Box/AI-CLI-LXC/main/uninstall-host.sh)
```
