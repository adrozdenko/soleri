#!/usr/bin/env bash
# ─── Tart Clean-Machine Test Runner for Soleri ───────────────────────────
# Restores a clean macOS VM, copies the test script, and runs it via SSH.
#
# Usage:
#   ./scripts/tart/test.sh                     # full test with restore
#   ./scripts/tart/test.sh --no-restore        # skip restore (reuse current VM state)
#   ./scripts/tart/test.sh --publish <tarball>  # test from a local .tgz instead of npm
#
# Prerequisites:
#   - Run setup.sh first to create the VM template
#   - VM must have SSH enabled
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VM_NAME="soleri-test"
SSH_USER="admin"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"
RESTORE=true
TARBALL=""

log() { printf "\033[1;34m==> %s\033[0m\n" "$1"; }
err() { printf "\033[1;31mError: %s\033[0m\n" "$1" >&2; exit 1; }

# ─── Parse args ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-restore) RESTORE=false; shift ;;
    --publish)    TARBALL="$2"; shift 2 ;;
    *)            err "Unknown argument: $1" ;;
  esac
done

# ─── Restore VM to clean state ──────────────────────────────────────────
if $RESTORE; then
  log "Restoring VM to clean state..."
  "${SCRIPT_DIR}/restore.sh"
fi

# ─── Boot VM in background ──────────────────────────────────────────────
log "Booting VM '${VM_NAME}'..."
tart run "${VM_NAME}" --no-graphics &
TART_PID=$!

# Wait for VM to get an IP
log "Waiting for VM to boot and get an IP..."
VM_IP=""
for i in $(seq 1 60); do
  VM_IP=$(tart ip "${VM_NAME}" 2>/dev/null || true)
  if [[ -n "$VM_IP" ]]; then
    break
  fi
  sleep 2
done

if [[ -z "$VM_IP" ]]; then
  kill $TART_PID 2>/dev/null || true
  err "VM failed to get an IP after 120 seconds"
fi
log "VM IP: ${VM_IP}"

# Wait for SSH to become available
log "Waiting for SSH..."
for i in $(seq 1 30); do
  if ssh $SSH_OPTS "${SSH_USER}@${VM_IP}" "echo ok" &>/dev/null; then
    break
  fi
  sleep 2
done

ssh $SSH_OPTS "${SSH_USER}@${VM_IP}" "echo ok" &>/dev/null \
  || { kill $TART_PID 2>/dev/null || true; err "SSH not available after 60 seconds"; }

log "SSH connected."

# ─── Copy test script to VM ─────────────────────────────────────────────
log "Uploading test script..."
scp $SSH_OPTS "${SCRIPT_DIR}/guest-install.sh" "${SSH_USER}@${VM_IP}:/tmp/guest-install.sh"

# If testing from a local tarball, upload it too
if [[ -n "$TARBALL" ]]; then
  log "Uploading tarball: ${TARBALL}"
  scp $SSH_OPTS "${TARBALL}" "${SSH_USER}@${VM_IP}:/tmp/soleri-cli.tgz"
fi

# ─── Run test ────────────────────────────────────────────────────────────
log "Running clean-machine test..."
echo ""

EXIT_CODE=0
ssh $SSH_OPTS "${SSH_USER}@${VM_IP}" "chmod +x /tmp/guest-install.sh && /tmp/guest-install.sh" || EXIT_CODE=$?

echo ""

# ─── Fetch log ───────────────────────────────────────────────────────────
log "Fetching test log..."
mkdir -p "${SCRIPT_DIR}/logs"
LOG_NAME="test-$(date +%Y%m%d-%H%M%S).log"
scp $SSH_OPTS "${SSH_USER}@${VM_IP}:/tmp/soleri-test-*.log" "${SCRIPT_DIR}/logs/${LOG_NAME}" 2>/dev/null || true

# ─── Shutdown VM ─────────────────────────────────────────────────────────
log "Shutting down VM..."
ssh $SSH_OPTS "${SSH_USER}@${VM_IP}" "sudo shutdown -h now" 2>/dev/null || true
sleep 3
kill $TART_PID 2>/dev/null || true

# ─── Report ──────────────────────────────────────────────────────────────
if [ $EXIT_CODE -eq 0 ]; then
  log "Clean-machine test PASSED"
else
  log "Clean-machine test FAILED (exit code: ${EXIT_CODE})"
  log "Log saved to: scripts/tart/logs/${LOG_NAME}"
fi

exit $EXIT_CODE
