#!/usr/bin/env bash

# proxmox-create-lxc.sh
# Run this directly on your Proxmox Host shell to automatically create
# a new Ubuntu 24.04 LXC and deploy the AI Terminal Workspace inside it.
# Usage: bash <(curl -s https://raw.githubusercontent.com/Pxl-Box/AI-CLI-LXC/main/proxmox-create-lxc.sh)

set -e

echo "=========================================================="
echo " Starting AI Terminal Workspace LXC Creation"
echo "=========================================================="

# Check if running on Proxmox
if ! command -v pct &> /dev/null; then
    echo "Error: This script must be run on the Proxmox Host shell."
    echo "It looks like you are not running Proxmox VE, or pct is missing."
    exit 1
fi

CTID=$(pvesh get /cluster/nextid)
echo "[+] Using next available Container ID: $CTID"

echo "[+] Updating Proxmox template list..."
pveam update >/dev/null

echo "[+] Finding the latest Ubuntu 24.04 template..."
# List available system templates, filter for ubuntu-24.04, get the full template name
TEMPLATE=$(pveam available -section system | grep 'ubuntu-24.04-standard' | awk '{print $2}' | sort -V | tail -n 1)

if [ -z "$TEMPLATE" ]; then
    echo "Error: Could not find an Ubuntu 24.04 template."
    exit 1
fi

echo "[+] Downloading template $TEMPLATE to 'local' storage..."
pveam download local $TEMPLATE || echo "Template already downloaded, continuing..."

echo "[+] Creating LXC container $CTID..."
# Extract just the filename for pct create
TEMPLATE_FILE=${TEMPLATE##*/}
pct create $CTID local:vztmpl/$TEMPLATE_FILE \
    --arch amd64 \
    --ostype ubuntu \
    --hostname ai-workspace \
    --password "password" \
    --cores 2 \
    --memory 2048 \
    --swap 512 \
    --rootfs local-lvm:30 \
    --net0 name=eth0,bridge=vmbr0,ip=dhcp \
    --unprivileged 1 \
    --features nesting=1

echo "[+] Starting LXC container $CTID..."
pct start $CTID

echo "[+] Waiting for container network to initialize (15 seconds)..."
sleep 15

echo "[+] Injecting the inner installation script into the LXC..."
pct exec $CTID -- bash -c "apt-get update -y && apt-get install -y curl"
pct exec $CTID -- bash -c "bash <(curl -s https://raw.githubusercontent.com/Pxl-Box/AI-CLI-LXC/main/install.sh)"

echo "=========================================================="
echo " Success! The AI Terminal Workspace has been deployed."
echo " Container ID: $CTID"
echo " You can find the IP address by clicking on the LXC in the Proxmox UI under 'Summary'."
echo " Access the web interface at: http://<LXC_IP>:3000"
echo "=========================================================="
