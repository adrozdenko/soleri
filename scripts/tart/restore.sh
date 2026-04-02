#!/usr/bin/env bash
# ─── Restore Soleri test VM to clean state ───────────────────────────────
# Deletes the current VM and re-clones from the clean template.
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

VM_NAME="soleri-test"
TEMPLATE_NAME="${VM_NAME}-template"

log() { printf "\033[1;34m==> %s\033[0m\n" "$1"; }
err() { printf "\033[1;31mError: %s\033[0m\n" "$1" >&2; exit 1; }

# Check template exists
tart list | grep -q "${TEMPLATE_NAME}" || err "Template '${TEMPLATE_NAME}' not found. Run setup.sh first."

log "Deleting current VM '${VM_NAME}'..."
tart delete "${VM_NAME}" 2>/dev/null || true

log "Cloning from clean template..."
tart clone "${TEMPLATE_NAME}" "${VM_NAME}"

log "VM restored to clean state."
