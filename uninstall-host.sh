#!/usr/bin/env bash

# uninstall-host.sh
# Run this on your Proxmox Host to clean up the accidental installation.

echo "=========================================================="
echo " Cleaning up accidental AI Workspace host installation"
echo "=========================================================="

# 1. Stop and remove PM2 processes
echo "[-] Stopping PM2 processes..."
pm2 delete ai-terminal || true
pm2 unstartup systemd || true

# 2. Uninstall global npm packages
echo "[-] Uninstalling node global packages..."
npm uninstall -g @google/gemini-cli @anthropic-ai/claude-code pm2 || true

# 3. Remove Node.js
echo "[-] Removing Node.js..."
apt remove --purge -y nodejs npm || true
rm -rf /etc/apt/sources.list.d/nodesource.list || true
apt update -y || true

# 4. Remove the project directory
echo "[-] Removing project files..."
rm -rf /opt/ai-workspace || true

echo "=========================================================="
echo " Cleanup complete! Your Proxmox host is clean."
echo "=========================================================="
