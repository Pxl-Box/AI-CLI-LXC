#!/bin/bash

# setup-lxc.sh
# Automated Installation Script for Web-Based AI Terminal Workspace
# Target: Ubuntu 24.04 LXC (Proxmox)

set -e

echo "=========================================================="
echo " Starting AI Terminal Workspace Installation on Ubuntu LXC"
echo "=========================================================="

# 1. Update and Upgrade System
echo "[1/6] Updating system packages..."
apt update && apt upgrade -y

# 2. Install Dependencies
echo "[2/6] Installing dependencies..."
apt install -y curl git build-essential python3

# 3. Install Node.js v20
echo "[3/6] Installing Node.js (v20)..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 4. Install Global AI CLIs
echo "[4/6] Installing Gemini CLI & Claude Code globally..."
npm install -g @google/gemini-cli @anthropic-ai/claude-code

# 5. Install PM2
echo "[5/6] Installing PM2 process manager..."
npm install -g pm2

# 6. Initialize local app (from the SCP'd directory)
echo "[6/6] Installing local app dependencies..."
# We assume the user has copied the node files into /opt/ai-workspace
if [ ! -d "/opt/ai-workspace" ]; then
    echo "Warning: /opt/ai-workspace directory not found."
    echo "Please ensure you run this script from inside the app directory,"
    echo "or SCP the files to /opt/ai-workspace first."
else
    cd /opt/ai-workspace
    npm install
    
    # Optional: Start with PM2
    pm2 start server.js --name "ai-terminal"
    pm2 save
    pm2 startup
    echo "PM2 configured and application started!"
fi

echo "=========================================================="
echo " Installation Complete!"
echo " If started, your web workspace is accessible on port 3000."
echo " e.g., http://<LXC_IP>:3000"
echo "=========================================================="
