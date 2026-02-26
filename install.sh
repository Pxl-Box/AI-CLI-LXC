#!/bin/bash

# install.sh
# One-line installer for AI Terminal Workspace
# Run this inside a fresh Ubuntu 24.04 LXC
# Command: bash <(curl -s https://raw.githubusercontent.com/Pxl-Box/AI-CLI-LXC/main/install.sh)

set -e

# --- CONFIGURATION ---
TARGET_DIR="/opt/ai-workspace"

if [ -n "$GITHUB_TOKEN" ]; then
    echo "Using provided GITHUB_TOKEN for authentication."
    REPO_URL="https://${GITHUB_TOKEN}@github.com/Pxl-Box/AI-CLI-LXC.git"
else
    REPO_URL="https://github.com/Pxl-Box/AI-CLI-LXC.git"
fi
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
