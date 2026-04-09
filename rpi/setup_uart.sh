#!/bin/bash
# =============================================================================
# setup_uart.sh — Fix RPi 4B UART for NPK sensor (MAX485 on GPIO14/15)
# Team OJAS · NIT Hamirpur
#
# Problem:
#   RPi 4B has TWO UARTs:
#     PL011  (full, stable)  → /dev/ttyAMA0  — grabbed by Bluetooth by default
#     mini-UART (unreliable) → /dev/ttyS0    — clock tied to CPU freq, drifts
#
#   At 9600 baud Modbus RTU, mini-UART causes framing errors / garbage data.
#   This script reassigns PL011 to GPIO14/15 by disabling Bluetooth.
#
# What this script does:
#   1. Adds dtoverlay=disable-bt to /boot/firmware/config.txt
#   2. Disables hciuart systemd service (Bluetooth UART daemon)
#   3. Creates /dev/npk → /dev/ttyAMA0 symlink (persistent via /etc/rc.local)
#   4. Adds user 'ronak' to dialout group (required for serial access)
#
# Run ONCE as root:
#   chmod +x setup_uart.sh
#   sudo ./setup_uart.sh
#   sudo reboot   ← REQUIRED for overlay to take effect
# =============================================================================

set -e

CONFIG="/boot/firmware/config.txt"
# Older RPi OS uses /boot/config.txt
[ -f "$CONFIG" ] || CONFIG="/boot/config.txt"

echo "=== OJAS UART Setup for RPi 4B ==="
echo "Config file: $CONFIG"

# ── Step 1: Disable Bluetooth, assign PL011 to GPIO14/15 ──────────────────
echo ""
echo "[1/4] Patching $CONFIG ..."

# Remove any conflicting/duplicate entries first
sudo sed -i '/dtoverlay=disable-bt/d' "$CONFIG"
sudo sed -i '/dtoverlay=miniuart-bt/d' "$CONFIG"
sudo sed -i '/enable_uart/d' "$CONFIG"

# Append correct overlays
cat >> "$CONFIG" << 'EOF'

# === OJAS: NPK Sensor UART Fix ===
# Disable Bluetooth so PL011 UART is freed for GPIO14/15 (NPK MAX485)
dtoverlay=disable-bt
enable_uart=1
EOF

echo "    Added: dtoverlay=disable-bt + enable_uart=1"

# ── Step 2: Disable hciuart service ───────────────────────────────────────
echo ""
echo "[2/4] Disabling hciuart service ..."
sudo systemctl disable hciuart 2>/dev/null || echo "    hciuart not found (OK)"
sudo systemctl stop    hciuart 2>/dev/null || true
echo "    hciuart disabled."

# ── Step 3: Disable serial getty on ttyAMA0 (frees it from login prompt) ──
echo ""
echo "[3/4] Disabling serial-getty on ttyAMA0 ..."
sudo systemctl disable serial-getty@ttyAMA0.service 2>/dev/null || true
sudo systemctl stop    serial-getty@ttyAMA0.service 2>/dev/null || true
# Also disable on ttyS0 just in case
sudo systemctl disable serial-getty@ttyS0.service 2>/dev/null || true
sudo systemctl stop    serial-getty@ttyS0.service 2>/dev/null || true
echo "    Serial getty disabled."

# ── Step 4: Create persistent /dev/npk symlink via udev ───────────────────
echo ""
echo "[4/4] Creating /dev/npk symlink rule ..."
cat > /etc/udev/rules.d/98-ojas-npk-uart.rules << 'EOF'
# OJAS: NPK sensor is on RPi hardware UART (PL011 / ttyAMA0)
# Create stable symlink /dev/npk → /dev/ttyAMA0
KERNEL=="ttyAMA0", SYMLINK+="npk", MODE="0666", GROUP="dialout"
EOF
echo "    Created /etc/udev/rules.d/98-ojas-npk-uart.rules"

# ── Step 5: Add user ronak to dialout group ───────────────────────────────
echo ""
echo "[5/5] Adding user 'ronak' to dialout group ..."
sudo usermod -aG dialout ronak
echo "    Done."

# ── Reload udev ───────────────────────────────────────────────────────────
sudo udevadm control --reload-rules
sudo udevadm trigger

echo ""
echo "============================================================"
echo "  Setup complete. NOW RUN:  sudo reboot"
echo ""
echo "  After reboot, verify with:"
echo "    ls -la /dev/npk        → should point to /dev/ttyAMA0"
echo "    ls -la /dev/lilygo     → should point to your LilyGo port"
echo "    ls -la /dev/nodemcu    → should point to your NodeMCU port"
echo ""
echo "  Test NPK manually:"
echo "    python3 sensor_npk.py"
echo "============================================================"
