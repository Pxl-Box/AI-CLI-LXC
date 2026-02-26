# AI Terminal Workspace

A sleek, modern web-based wrapper around local terminal tools, specialized for running AI CLIs like **Claude Code** and **Gemini CLI**.

## Prerequisites
- Node.js (v20+ recommended)
- `node-pty` requires Python and a C++ compiler (like `build-essential` or Visual Studio build tools on Windows).

## Local Testing (Windows Desktop)

1. Open your terminal in this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the node server:
   ```bash
   node server.js
   ```
4. Open your web browser and navigate to `http://localhost:3000`. You should see the sleek dark-mode UI and have a functional PowerShell session (if on Windows) embedded.

## Deployment to Proxmox

The absolute easiest way to deploy this is to run the automated host creation script directly from your **Proxmox Host Shell** (not inside an existing VM/LXC).

### Automatic Deployment (Recommended)
1. Open your Proxmox web UI.
2. Select your node (e.g., `pve`) and click **Shell**.
3. Run the following command:

```bash
bash <(curl -s https://raw.githubusercontent.com/Pxl-Box/AI-CLI-LXC/main/proxmox-create-lxc.sh)
```

This script handles absolutely everything:
- It downloads the latest Ubuntu 24.04 template.
- It dynamically creates a new unprivileged LXC with exactly the right specs (`local-lvm`, nesting enabled, 2GB RAM).
- It boots the container and injects the `install.sh` and `setup-lxc.sh` scripts directly into it!

Once finished, simply look at the console output for the assigned IP address and access the UI via `http://<LXC_IP>:3000`.

### Manual Deployment (Inside an Existing LXC)
If you already created your own Ubuntu 24.04 LXC and want to run the installer inside of it manually, SSH into that LXC and run:

```bash
bash <(curl -s https://raw.githubusercontent.com/Pxl-Box/AI-CLI-LXC/main/install.sh)
```

---

### Oops I ran the install.sh on my Proxmox Host!
If you accidentally ran the inner `install.sh` in the Proxmox structural shell, you can safely completely uninstall it using the cleanup script:
```bash
bash <(curl -s https://raw.githubusercontent.com/Pxl-Box/AI-CLI-LXC/main/uninstall-host.sh)
```

**Pro Tip on Auth flows**: The Gemini CLI pops an OAuth flow out to the default browser. Inside headless LXC, this flow outputs a URL to the terminal console instead. The web workspace incorporates `xterm-addon-web-links`, which turns the ugly printed tokens into clickable URLs in the browser wrapper! Just click it to sign in on your host PC, grab the credentials, and paste them back into the terminal.
