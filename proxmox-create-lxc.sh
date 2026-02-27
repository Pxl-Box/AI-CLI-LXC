#!/usr/bin/env bash

# proxmox-create-lxc.sh
# Run this directly on your Proxmox Host shell to automatically create
# a new Ubuntu 24.04 LXC and deploy the AI Terminal Workspace inside it.

set -e

echo "=========================================================="
echo " Starting AI Terminal Workspace LXC Creation"
echo "=========================================================="

# Check if running on Proxmox
if ! command -v pct &> /dev/null; then
    echo "Error: This script must be run on the Proxmox Host shell."
    exit 1
fi

# 1. Setup Selection
echo "Select installation type:"
echo "1) Default (6GB RAM, 30GB Disk, 2 Cores)"
echo "2) Custom (Configure RAM, Disk, CPU, User, Password)"
read -p "Enter choice [1-2]: " INSTALL_CHOICE

# Default Values
RAM=6144
DISK=30
CORES=2
LXC_USER="root"
LXC_PASS="password"
HOSTNAME="ai-workspace"

if [ "$INSTALL_CHOICE" == "2" ]; then
    echo ""
    echo "--- Custom Configuration ---"
    read -p "Enter Hostname [$HOSTNAME]: " input_hostname
    HOSTNAME=${input_hostname:-$HOSTNAME}

    read -p "Enter RAM in MB [$RAM]: " input_ram
    RAM=${input_ram:-$RAM}

    read -p "Enter Disk size in GB [$DISK]: " input_disk
    DISK=${input_disk:-$DISK}

    read -p "Enter CPU Cores [$CORES]: " input_cores
    CORES=${input_cores:-$CORES}

    read -p "Enter LXC Password [$LXC_PASS]: " input_pass
    LXC_PASS=${input_pass:-$LXC_PASS}
    echo "----------------------------"
fi

CTID=$(pvesh get /cluster/nextid)
echo "[+] Using next available Container ID: $CTID"

echo "[+] Updating Proxmox template list..."
pveam update >/dev/null

echo "[+] Finding the latest Ubuntu 24.04 template..."
TEMPLATE=$(pveam available -section system | grep 'ubuntu-24.04-standard' | awk '{print $2}' | sort -V | tail -n 1)

if [ -z "$TEMPLATE" ]; then
    echo "Error: Could not find an Ubuntu 24.04 template."
    exit 1
fi

echo "[+] Downloading template $TEMPLATE to 'local' storage..."
pveam download local $TEMPLATE || echo "Template already downloaded, continuing..."

echo "[+] Creating LXC container $CTID ($HOSTNAME)..."
TEMPLATE_FILE=${TEMPLATE##*/}
pct create $CTID local:vztmpl/$TEMPLATE_FILE \
    --arch amd64 \
    --ostype ubuntu \
    --hostname "$HOSTNAME" \
    --password "$LXC_PASS" \
    --cores "$CORES" \
    --memory "$RAM" \
    --swap 512 \
    --rootfs local-lvm:"$DISK" \
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
echo " Hostname: $HOSTNAME"
echo " Configuration: $RAM MB RAM, $DISK GB Disk, $CORES Cores"
echo " Access the web interface at: http://<LXC_IP>:3000"
echo "=========================================================="
