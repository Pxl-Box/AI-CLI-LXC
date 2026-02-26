# GEMINI Mandates - AI Terminal Workspace (AI-CLI-LXC)

This directory is the primary workspace for maintaining and extending the web-based terminal interface for AI CLIs.

## Memory & Context Workflow
- **Commit to Memory:** When the "Commit to Memory" button is clicked, it sends an instruction to update the current workspace's `GEMINI.md` file. 
- **AI Action:** The AI must respond by summarizing the progress made during the session, identifying any new project-specific mandates, and updating the file to ensure continuity across future sessions.
- **Hierarchical Memory:** Always prioritize updating the most specific `GEMINI.md` file (the one in the active workspace directory) over more general parent or global context files.

## Key Files & Directories
- `server.js`: The core Express/Node.js server handling PTY and static file serving.
- `public/`: Frontend React/Vanilla JS assets for the terminal UI.
- `scripts/`: (`install.sh`, `proxmox-create-lxc.sh`, `setup-lxc.sh`) Deployment and configuration scripts.
- `package.json`: Dependency management for the Node.js environment.

## Workspace Mandates
- **Stability:** Ensure all changes to `server.js` or deployment scripts are thoroughly tested for regressions, especially regarding terminal sizing and shell execution.
- **Multi-Session Management:** When modifying PTY logic, ensure that tab IDs are correctly propagated through the socket layer to prevent cross-tab data leakage.
- **Soft Update Integrity:** Maintain the version-checking logic in `install.sh`. Any new global dependencies must be added to the check list in `setup-lxc.sh` to prevent unnecessary re-installs.
- **UX Consistency:** The terminal UI must remain minimal, high-performance, and focused on AI development workflows. New UI elements (like the tab bar and usage bars) must follow the established glassmorphism aesthetic.
- **Authentication Resilience:** Always check for an active GitHub PAT in the root `GEMINI.md` before attempting a push. Never store credentials locally within this workspace; always reference the master mandate.
- **Security:** Maintain strict isolation between the web terminal and the host system. Validate all file path operations from the UI.

## Development Workflow
1. **Testing:** Run `npm install` and `node server.js` to test UI changes locally on `http://localhost:3000`.
2. **Deployment:** Update shell scripts only after confirming manual installation steps on a clean Ubuntu 24.04 environment.
3. **PTE Management:** When modifying `node-pty` logic, ensure correct handling of window resizing events to prevent visual artifacts.

## Recent Progress (Session: Feb 26, 2026)
- **Multi-Tab Terminal Support:** Implemented a full tab-based interface for the web terminal.
- **UI & Aesthetic Refinements:** Added model usage statistics, glassmorphism sidebar elements, and cache-busting versioning (v1.1) to ensure frontend updates are immediately visible.
- **Optimized Deployment (Soft Update):** Enhanced `setup-lxc.sh` with a forced `pm2 restart` cycle and cache-bust instructions.
- **Robustness & Update Integrity:** Updated `install.sh` to include `git checkout .` before pulling, ensuring the front-end definitely updates even if minor local modifications exist in the deployment folder.
- **Scrolling & Layout Fixes:** Refined terminal container CSS and increased `fitAddon` timeouts to 50ms to resolve intermittent scrolling and sizing issues.
- **Session Persistence & Isolation:** Enhanced `server.js` to manage a map of PTY processes per client.
--- End of Recent Progress ---
