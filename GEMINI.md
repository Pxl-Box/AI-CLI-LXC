# GEMINI Mandates - AI Terminal Workspace (AI-CLI-LXC)

This directory is the primary workspace for maintaining and extending the web-based terminal interface for AI CLIs.

## Project Overview
**Source Repository:** This workspace contains the development source code for the "AI Terminal" wrapper. It serves as the staging area for updates, bug fixes, and feature enhancements to the platform itself.

The "AI Terminal" provides:
- **Web-based Terminal:** Interactive `xterm.js` and `node-pty` integration.
- **File Exploration:** Native browser access to local directories.
- **Model Context Separation:** Separate working paths for different AI models.
- **Auto-deployment:** Proxmox-optimized installation scripts for LXCs.

## Key Files & Directories
- `server.js`: The core Express/Node.js server handling PTY and static file serving.
- `public/`: Frontend React/Vanilla JS assets for the terminal UI.
- `scripts/`: (`install.sh`, `proxmox-create-lxc.sh`, `setup-lxc.sh`) Deployment and configuration scripts.
- `package.json`: Dependency management for the Node.js environment.

## Workspace Mandates
- **Stability:** Ensure all changes to `server.js` or deployment scripts are thoroughly tested for regressions, especially regarding terminal sizing and shell execution.
- **Security:** Maintain strict isolation between the web terminal and the host system. Validate all file path operations from the UI.
- **UX Consistency:** The terminal UI must remain minimal, high-performance, and focused on AI development workflows.

## Development Workflow
1. **Testing:** Run `npm install` and `node server.js` to test UI changes locally on `http://localhost:3000`.
2. **Deployment:** Update shell scripts only after confirming manual installation steps on a clean Ubuntu 24.04 environment.
3. **PTE Management:** When modifying `node-pty` logic, ensure correct handling of window resizing events to prevent visual artifacts.
