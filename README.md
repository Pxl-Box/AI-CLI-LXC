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

## Deployment to Proxmox LXC (Ubuntu 24.04)

### 1. Create a Headless LXC
In Proxmox, create a new container using the Ubuntu 24.04 template. Ensure it has an IP address on your network.

### 2. Run the Helper Install Script
Once your LXC is running and connected to the internet, SSH into it and run the automatic one-line installer. 

> **Note:** Before running, you must open `install.sh` and change `YOUR_GITHUB_USERNAME` to your actual GitHub username where you pushed this repository!

```bash
# In your Proxmox LXC:
bash <(curl -s https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/AI-CLI-LXC/main/install.sh)
```

This script will automatically:
- Install `git` and `curl`
- Clone your repository to `/opt/ai-workspace`
- Execute the `setup-lxc.sh` script to configure Node.js, AI CLIs, and PM2.

### 4. Usage
Access the UI via `http://<LXC_IP>:3000` in your host browser.

**Pro Tip on Auth flows**: The Gemini CLI pops an OAuth flow out to the default browser. Inside headless LXC, this flow outputs a URL to the terminal console instead. The web workspace incorporates `xterm-addon-web-links`, which turns the ugly printed tokens into clickable URLs in the browser wrapper! Just click it to sign in on your host PC, grab the credentials, and paste them back into the terminal.
