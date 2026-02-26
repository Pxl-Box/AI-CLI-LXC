#!/bin/bash

# setup-lxc.sh
# Automated Installation Script for Web-Based AI Terminal Workspace
# Target: Ubuntu 24.04 LXC (Proxmox)

set -e

SOFT_UPDATE=false
if [[ "$1" == "--soft" ]]; then
    SOFT_UPDATE=true
    echo "[!] Performing a SOFT refresh (skipping system updates and full re-installs)..."
fi

echo "=========================================================="
echo " Starting AI Terminal Workspace Setup"
echo "=========================================================="

# 1. Update and Upgrade System
if [ "$SOFT_UPDATE" = false ]; then
    echo "[1/6] Updating system packages..."
    apt update && apt upgrade -y
else
    echo "[1/6] Skipping full system upgrade (Soft Mode)..."
    apt update -y > /dev/null 2>&1 || true
fi

# 2. Install Dependencies
echo "[2/6] Checking dependencies..."
apt install -y curl git build-essential python3 > /dev/null 2>&1

# 3. Install Node.js v20 (Check if already installed)
echo "[3/6] Checking Node.js (v20)..."
if ! command -v node &> /dev/null || [[ $(node -v) != v20* ]]; then
    echo "[+] Installing Node.js (v20)..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
else
    echo "[+] Node.js $(node -v) is already installed."
fi

# 4. Install Global AI CLIs (Only if not already installed)
echo "[4/6] Checking Global AI CLIs..."
if ! command -v gemini &> /dev/null || ! command -v claude &> /dev/null; then
    echo "[+] Installing Gemini CLI & Claude Code globally..."
    npm install -g @google/gemini-cli @anthropic-ai/claude-code
else
    echo "[+] Global CLIs already present."
fi

# 5. Install PM2
echo "[5/6] Checking PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "[+] Installing PM2 process manager..."
    npm install -g pm2
else
    echo "[+] PM2 $(pm2 -v) is already installed."
fi

# 6. Initialize local app
echo "[6/6] Syncing local app dependencies..."
if [ ! -d "/opt/ai-workspace" ]; then
    echo "Warning: /opt/ai-workspace directory not found."
else
    cd /opt/ai-workspace
    
    # Only perform heavy NPM install if node_modules is missing or we are NOT in soft mode
    if [ ! -d "node_modules" ] || [ "$SOFT_UPDATE" = false ]; then
        echo "[+] Updating local dependencies (npm install)..."
        # We don't remove node_modules unless it's a forced full install
        if [ "$SOFT_UPDATE" = false ]; then
             echo "[+] Performing fresh build (rebuilding native modules)..."
             rm -rf package-lock.json
             npm install
             npm rebuild node-pty
        else
             npm install --no-audit --no-fund
        fi
    else
        echo "[+] Local dependencies are present. Skipping npm install."
    fi
    
    # Restart the application
    if pm2 list | grep -q "ai-terminal"; then
        echo "[+] Reloading AI Terminal service..."
        pm2 reload ai-terminal
    else
        echo "[+] Starting AI Terminal with PM2..."
        pm2 start server.js --name "ai-terminal"
        pm2 save
        pm2 startup
    fi
    echo "Service is healthy and updated!"
fi

echo "=========================================================="
echo " Installation Complete!"
echo " If started, your web workspace is accessible on port 3000."
echo " e.g., http://<LXC_IP>:3000"
echo "=========================================================="
