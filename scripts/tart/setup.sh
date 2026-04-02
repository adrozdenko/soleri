#!/usr/bin/env bash
# ─── Tart VM Setup for Soleri Clean-Machine Testing ──────────────────────
# Installs Tart, pulls a clean macOS image, and creates a base snapshot.
#
# Usage:
#   ./scripts/tart/setup.sh                    # defaults: macOS Sequoia
#   ./scripts/tart/setup.sh ventura            # macOS Ventura
#
# Prerequisites: Homebrew
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

VM_NAME="soleri-test"
MACOS_VARIANT="${1:-sequoia}"
IMAGE="ghcr.io/cirruslabs/macos-${MACOS_VARIANT}-base:latest"
SNAPSHOT_BASE="clean-base"

log() { printf "\033[1;34m==> %s\033[0m\n" "$1"; }
err() { printf "\033[1;31mError: %s\033[0m\n" "$1" >&2; exit 1; }

# ─── Install Tart ────────────────────────────────────────────────────────
if ! command -v tart &>/dev/null; then
  log "Installing Tart via Homebrew..."
  brew install cirruslabs/cli/tart
else
  log "Tart already installed: $(tart --version 2>/dev/null || echo 'unknown')"
fi

# ─── Pull or refresh macOS image ────────────────────────────────────────
log "Pulling macOS image: ${IMAGE}"
tart pull "${IMAGE}"

# ─── Create VM from image ───────────────────────────────────────────────
if tart list | grep -q "${VM_NAME}"; then
  log "VM '${VM_NAME}' already exists — deleting to recreate from fresh image"
  tart delete "${VM_NAME}" 2>/dev/null || true
fi

log "Cloning image to VM '${VM_NAME}'..."
tart clone "${IMAGE}" "${VM_NAME}"

# ─── Configure VM resources ─────────────────────────────────────────────
log "Configuring VM (4 CPU, 8GB RAM, 50GB disk)..."
tart set "${VM_NAME}" --cpu 4 --memory 8192 --disk-size 50

# ─── Boot, let it settle, then snapshot ─────────────────────────────────
log "Booting VM for initial setup..."
echo ""
echo "  The VM will open in a GUI window."
echo "  Complete the macOS Setup Assistant if prompted, then:"
echo ""
echo "    1. Open Terminal.app"
echo "    2. Enable SSH:  sudo systemsetup -setremotelogin on"
echo "    3. Note the IP:  ifconfig | grep 'inet '"
echo "    4. Shut down the VM:  sudo shutdown -h now"
echo ""
echo "  Once the VM shuts down, this script will create the base snapshot."
echo ""

tart run "${VM_NAME}"

# ─── After shutdown, create base snapshot ────────────────────────────────
log "VM shut down. Creating base snapshot '${SNAPSHOT_BASE}'..."
# Tart doesn't have built-in snapshots — we use APFS clone of the VM disk.
# Instead, we rely on `tart clone` from VM_NAME as our "restore" mechanism.
# Save the clean state by cloning to a template.
TEMPLATE_NAME="${VM_NAME}-template"
tart delete "${TEMPLATE_NAME}" 2>/dev/null || true
tart clone "${VM_NAME}" "${TEMPLATE_NAME}"

log "Done! Template saved as '${TEMPLATE_NAME}'"
echo ""
echo "Usage:"
echo "  ./scripts/tart/test.sh              # Run full test suite in clean VM"
echo "  ./scripts/tart/restore.sh           # Reset VM to clean state"
echo ""
echo "SSH into the VM:"
echo "  tart run ${VM_NAME} &"
echo "  ssh admin@\$(tart ip ${VM_NAME})"
