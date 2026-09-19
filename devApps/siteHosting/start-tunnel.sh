#!/bin/bash
cd /run/media/RitesDev/LinuxStorage/Projects/websites/RitesDev-ecosystem

# This cleans up background assets and ports safely during initialization or restarts
cleanup() {
    echo -e "\n[System] Stopping processes cleanly..."
    # Kill the background npm/node jobs started by this shell script
    kill $(jobs -p) 2>/dev/null
    pkill -f "cloudflared tunnel run" 2>/dev/null
    # Clear port 4321 using your workspace's native strategy
    fuser -k 4321/tcp 2>/dev/null || true
    sleep 0.5
}

# This is ONLY triggered when you intentionally want to exit and destroy the terminal
close_window() {
    cleanup

    # Safely look up the tree to find and close Konsole only when requested
    local pid=$$
    while [ "$pid" -gt 1 ]; do
        read -r ppid comm <<< "$(ps -o ppid= -o comm= -p "$pid" 2>/dev/null)"
        if [[ "$comm" == *"konsole"* ]]; then
            kill -9 "$pid" 2>/dev/null
            kill -9 "$ppid" 2>/dev/null
            exit 0
        fi
        pid="$ppid"
    done
    exit 0
}

# Ensure background jobs stop cleanly if the window is closed via the X button
trap "cleanup; exit" SIGINT SIGTERM

while true; do
    # This runs safely now because it only kills processes, not the window!
    cleanup 2>/dev/null
    clear

    echo "===================================================="
    echo " 🚀 Astro Server & Cloudflared Tunnel Active"
    echo " 🔄 Press [Ctrl + R] to RESTART the website"
    echo " ❌ Press [Ctrl + C] to EXIT completely"
    echo "===================================================="
    echo ""

    # 1. Start Astro using your exact project script settings in the background
    /usr/bin/npm run dev -- --host 127.0.0.1 --port 4321 --force &

    # Give Astro a 3-second head start to complete sync scripts and bind the port
    sleep 3

    # 2. Start Cloudflared Tunnel in the background
    cloudflared tunnel run astro-site-tunnel &

    # 3. Background loop to print a reminder every 10 minutes
    (
        while true; do
            sleep 600
            echo "===================================================="
            echo " 🚀 Astro Server & Cloudflared Tunnel Active"
            echo " 🔄 Press [Ctrl + R] to RESTART the pipeline"
            echo " ❌ Press [Ctrl + C] to EXIT completely"
            echo "===================================================="
            echo ""
        done
    ) &

    # Core keybind listener loop
    while true; do
        # Listen
        read -r -n 1 -s key
        # Intercept Ctrl+R (\x12) for custom hot-reboot sequences
        if [[ "$key" == $'\x12' ]]; then
            echo -e "\n⚡ [Ctrl+R] Detected! Re-initializing pipeline..."
            break
        fi
        # Intercept Ctrl+C (\x03) natively inside the listener
        if [[ "$key" == $'\x03' ]]; then
            echo -e "\n🛑 [Ctrl+C] Detected! Shutting down system..."
            close_window # Runs the safe window destroyer process
        fi
    done
done
