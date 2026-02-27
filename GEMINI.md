# GEMINI Mandates - AI Terminal Workspace (AI-CLI-LXC)

This directory is the primary workspace for maintaining and extending the web-based terminal interface for AI CLIs.

## Memory & Context Workflow
- **Commit to Memory:** When the "Commit to Memory" button (Floppy Disk icon) is clicked, it sends an instruction to update the current workspace's `GEMINI.md` file. 
- **AI Action:** The AI must respond by summarizing the progress made during the session, identifying any new project-specific mandates, and updating the file to ensure continuity across future sessions.
- **Hierarchical Memory:** Always prioritize updating the most specific `GEMINI.md` file (the one in the active workspace directory) over more general parent or global context files.

## Key Files & Directories
- `server.js`: Core Express server handling PTY, Multer uploads, and file downloads. Includes PATH injection for Ollama.
- `public/`: Frontend assets (Xterm.js, Socket.io, mobile-responsive CSS).
- `agents/`: Persistent JSON storage for custom AI personas.
- `generated/`: Dynamic workspace-specific folder for AI-outputted files.
- `proxmox-create-lxc.sh`: Interactive host-side script for customized LXC deployment.

## Workspace Mandates
- **UI Architecture:** The sidebar must use a collapsible accordion-style layout (details/summary). Primary actions reside in a dedicated icon row in the header: **Upload**, **Folder (Explorer)**, **Floppy (Memory)**, and **Bin (Clear)**.
- **Workspace Explorer:** The folder icon MUST launch a full-featured file explorer for the active workspace, allowing nested navigation and multi-file "Mentions."
- **Asset Integrity:** Uploaded files MUST be stored in the "Asset Storage Path" defined in settings, defaulting to the active workspace.
- **Auto-Mention:** Successfully uploaded or selected files MUST automatically send their filename to the terminal using the format: `Attached files: "filename.ext"\r` to trigger immediate AI processing.
- **Infrastructure Scaling:** 
    - Default deployments via `proxmox-create-lxc.sh` MUST use **6GB RAM**, **30GB Disk**, and **2 CPU Cores**.
    - The installation script MUST remain interactive, offering a "Quick Default" mode and a "Custom" mode for granular hardware and credential control.
- **PTY Isolation:** Every terminal tab MUST have `/usr/local/bin` explicitly injected into its environment PATH to ensure seamless access to Ollama.
- **Terminal Utilities:** The "Clear Terminal" button MUST automatically execute `/clear` for AI CLIs and `clear` for standard shells using `\r\n`.
- **System Monitoring:** The header MUST display a real-time "System Pulse" showing CPU and RAM utilization for the host container.
- **Session Resilience:** I MUST maintain a `.gemini_recovery.json` file in the workspace root. This file acts as a "Black Box" recorder. In the event of a session crash, the next AI instance MUST read this file during the Research phase to immediately resume work without user intervention.

## Recent Progress (Session: Feb 27, 2026 - Part 6)
- **Settings UI & Agent Hub:**
    - Created a dedicated **Agents Tab** in Settings for centralized persona management (create, edit, delete).
    - Synced agent lists between the sidebar and settings modal for real-time UI consistency.
    - **Local LLM Support:** Integrated installed Ollama models into Custom Agents model selection and launch logic.
- **Directory Browser Refactor:**
    - Reverted the browse functionality to a stylized dropdown folder explorer with subfolder list and icons.
    - Added an "Advanced" manual path entry section hidden behind an accordion.
- **Auth Verification:**
    - Implemented backend verification for GitHub, Claude, and Gemini auth states (checking hosts/config files).
    - Added green "✓ Linked" status indicators to login buttons in Settings.
- **Resilience:**
    - Hardened directory listing with `try/catch` blocks for `fs.statSync` and permission errors to prevent silent UI crashes on Windows.

## Recent Progress (Session: Feb 27, 2026 - Part 5)
- **Settings UI Refactor:**
    - Transitioned the Settings Modal from a scrollable list to a **Tabbed Sidebar Interface** for better organization.
    - Added tabs for: General, Workspace, Saved Projects, Import & Git, and Local AIs.
- **Enhanced Configuration:**
    - **General Tab:** Replaced API key inputs with buttons that launch Native CLIs (`gemini`, `claude`, `gh auth login`) in a new terminal tab for secure authentication.
    - **Workspace Tab:** Added an explicit `Generated Content Path` configuration alongside Asset Storage.
- **Git & Tool Integrations:**
    - **Import & Git:** Added `git clone` capability directly via URL to pull repositories into the assigned workspace.
    - **Local AIs:** Implemented an integrated view of installed Ollama models with a direct "Delete" button mapping to `ollama rm`.

## Recent Progress (Session: Feb 27, 2026 - Part 4)
- **Real-time Monitoring & UI:**
    - Integrated `systeminformation` into the backend to track host resources (CPU/RAM).
    - Implemented a "System Pulse" display in the sidebar header.
    - Refactored "Usage Bars" to be reactive, reflecting real-time data throughput for active AI personas.
- **Agent Management:**
    - Implemented "Edit Agent" functionality, allowing users to update existing persona prompts and models.
- **Advanced Terminal Features:**
    - **Dual-Terminal Split View:** Added side-by-side terminal support with pinned tabs.
    - **Terminal Session Persistence:** Implemented global PTY management and re-attachment logic (sessions survive page refreshes).
- **Workspace Explorer & Power Tools:**
    - **Rich File Preview (Peek):** Added an "Eye/Peek" modal with Prism.js syntax highlighting for instant code verification.
    - **Smart Context Gatherer:** Added "Gather Context" to automatically identify and mention architectural files.
    - **Multi-select Mentions:** Implemented checkboxes for granular, batch file processing.
    - **In-modal Folder Creation:** Streamlined directory management within the explorer.
- **Local LLM Integration:**
    - **Live Ollama Sync:** Dynamically populates the model selection dropdown from the host container's installed models.
- **Reliability & Resilience:**
    - **Black Box Recovery:** Implemented `.gemini_recovery.json` for autonomous state recovery across AI session crashes.
- **Dependency Management:**
    - Added `unzipper`, `systeminformation`, and Prism.js integration.

## Recent Progress (Session: Feb 27, 2026 - Part 3)
- **Advanced File Management:**
    - Refactored "Generated Content" into a comprehensive **Workspace Explorer** with folder navigation.
    - Implemented **"Mention All Files"** and individual file mentions within the explorer.
    - Added **Workspace ZIP Import**: Users can now upload and automatically unpack project archives into the workspace.
    - Added **Asset Storage Path** configuration in Settings to separate uploads from workspace roots.
- **Infrastructure & Deployment:**
    - Refactored `proxmox-create-lxc.sh` into an interactive installation wizard.
    - Increased default LXC resource allocation to **6GB RAM** and **30GB Disk**.
    - Implemented a "Custom" configuration mode allowing users to define Hostname, RAM, Disk, CPU, and Password during setup.
- **Final UI Cleanup:**
    - Relocated "Commit to Memory" and "Clear Terminal" to header icons, completing the 4-icon primary action row.
    - Verified all sidebar sections are collapsible via accordion layout.

## Recent Progress (Session: Feb 27, 2026 - Part 2)
- **Sidebar UI Refactor:** Reorganized the sidebar into collapsible accordion sections and header icons.
- **Enhanced File Synergy:** Implemented Auto-Mention with Auto-Enter for uploaded assets.
- **Ollama Reliability:** Fixed PATH and dependency issues (`zstd`) for local model execution.

## Recent Progress (Session: Feb 27, 2026 - Part 1)
- **Model Selection & Assets:** Expanded Gemini model tiers and implemented the `multer`-based asset management system.
- **Mobile-First UX:** Implemented the collapsible mobile sidebar and hamburger menu toggle.

--- End of Recent Progress ---
