#!/bin/bash

# install.sh
# One-line installer for AI Terminal Workspace
# Run this inside a fresh Ubuntu 24.04 LXC
# Command: bash <(curl -s https://raw.githubusercontent.com/Pxl-Box/AI-CLI-LXC/main/install.sh)

set -e

# --- CONFIGURATION ---
# Replace this with your actual GitHub repository URL once pushed
REPO_URL="https://github.com/Pxl-Box/AI-CLI-LXC.git"
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
    
    # Check if we actually need to pull anything
    git fetch
    UPSTREAM=${1:-'@{u}'}
    LOCAL=$(git rev-parse @)
    REMOTE=$(git rev-parse "$UPSTREAM")
    
    if [ "$LOCAL" = "$REMOTE" ]; then
        echo "[+] Code is already up to date."
        UPDATE_NEEDED=false
    else
        echo "[+] New changes detected. Updating..."
        git checkout .
        git pull
        UPDATE_NEEDED=true
    fi
else
    echo "[+] Cloning repository to $TARGET_DIR..."
    git clone "$REPO_URL" "$TARGET_DIR"
    cd "$TARGET_DIR"
    UPDATE_NEEDED=true
fi

echo "[+] Making setup script executable..."
chmod +x setup-lxc.sh

if [ "$UPDATE_NEEDED" = true ]; then
    echo "[+] Launching setup script..."
    ./setup-lxc.sh
else
    echo "[+] Skipping full setup as code is already up to date."
    echo "[+] Running soft-refresh to ensure services are active..."
    ./setup-lxc.sh --soft
fi
