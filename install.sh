#!/bin/bash

# install.sh
# One-line installer for AI Terminal Workspace
# Run this inside a fresh Ubuntu 24.04 LXC
# Command: bash <(curl -s https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/AI-CLI-LXC/main/install.sh)

set -e

# --- CONFIGURATION ---
# Replace this with your actual GitHub repository URL once pushed
REPO_URL="https://github.com/YOUR_GITHUB_USERNAME/AI-CLI-LXC.git"
TARGET_DIR="/opt/ai-workspace"
# ---------------------

echo "=========================================================="
echo " Fetching AI Terminal Workspace from GitHub"
echo "=========================================================="

echo "[+] Updating apt and installing git/curl..."
apt update -y
apt install -y git curl

if [ -d "$TARGET_DIR" ]; then
    echo "[+] Directory $TARGET_DIR already exists. Pulling latest updates..."
    cd "$TARGET_DIR"
    git pull
else
    echo "[+] Cloning repository to $TARGET_DIR..."
    git clone "$REPO_URL" "$TARGET_DIR"
    cd "$TARGET_DIR"
fi

echo "[+] Making setup script executable..."
chmod +x setup-lxc.sh

echo "[+] Launching main setup script..."
./setup-lxc.sh
