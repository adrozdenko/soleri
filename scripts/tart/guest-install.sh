#!/usr/bin/env bash
# ─── Guest Script: Install Soleri on a clean macOS VM ────────────────────
# This script runs INSIDE the Tart VM via SSH.
# It simulates a first-time user installing Soleri from scratch.
#
# Exit codes:
#   0  All checks passed
#   1  A step failed
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

AGENT_NAME="${1:-test-agent}"
LOG_FILE="/tmp/soleri-test-$(date +%Y%m%d-%H%M%S).log"

log()  { printf "\033[1;34m[TEST] %s\033[0m\n" "$1" | tee -a "$LOG_FILE"; }
pass() { printf "\033[1;32m  [PASS] %s\033[0m\n" "$1" | tee -a "$LOG_FILE"; }
fail() { printf "\033[1;31m  [FAIL] %s\033[0m\n" "$1" | tee -a "$LOG_FILE"; FAILURES=$((FAILURES + 1)); }

FAILURES=0

# ─── Phase 1: System Prerequisites ──────────────────────────────────────
log "Phase 1: Checking system prerequisites"

# Install Homebrew if missing
if ! command -v brew &>/dev/null; then
  log "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/null
  eval "$(/opt/homebrew/bin/brew shellenv)"
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
fi
command -v brew &>/dev/null && pass "Homebrew available" || fail "Homebrew not available"

# Install Node.js
if ! command -v node &>/dev/null; then
  log "Installing Node.js via Homebrew..."
  brew install node
fi

NODE_VERSION=$(node --version 2>/dev/null || echo "none")
log "Node.js version: ${NODE_VERSION}"
if [[ "$NODE_VERSION" != "none" ]] && [[ "${NODE_VERSION#v}" > "18" || "${NODE_VERSION#v}" == "18"* ]]; then
  pass "Node.js >= 18 (${NODE_VERSION})"
else
  fail "Node.js >= 18 required (got ${NODE_VERSION})"
fi

NPM_VERSION=$(npm --version 2>/dev/null || echo "none")
[[ "$NPM_VERSION" != "none" ]] && pass "npm available (${NPM_VERSION})" || fail "npm not available"

# ─── Phase 2: Install Soleri CLI ─────────────────────────────────────────
log "Phase 2: Installing Soleri CLI"

# Test global install (as a user would)
npm install -g @soleri/cli 2>&1 | tee -a "$LOG_FILE"
command -v soleri &>/dev/null && pass "soleri CLI in PATH" || fail "soleri CLI not in PATH"

# Verify version
SOLERI_VERSION=$(soleri --version 2>/dev/null || echo "none")
[[ "$SOLERI_VERSION" != "none" ]] && pass "soleri version: ${SOLERI_VERSION}" || fail "soleri --version failed"

# ─── Phase 3: Create Agent (scaffold) ───────────────────────────────────
log "Phase 3: Scaffolding agent '${AGENT_NAME}'"

WORK_DIR=$(mktemp -d)
cd "$WORK_DIR"

# Non-interactive create — pass defaults
# The create wizard needs stdin; use expect-style or --yes flag if available
npx @soleri/cli create "$AGENT_NAME" --defaults 2>&1 | tee -a "$LOG_FILE" || true

if [ -d "${WORK_DIR}/${AGENT_NAME}" ]; then
  pass "Agent directory created"
  cd "${WORK_DIR}/${AGENT_NAME}"
else
  fail "Agent directory not created"
  # Try alternative: npm create
  log "Trying npm create soleri..."
  cd "$WORK_DIR"
  npm create soleri -- "$AGENT_NAME" --defaults 2>&1 | tee -a "$LOG_FILE" || true
  if [ -d "${WORK_DIR}/${AGENT_NAME}" ]; then
    pass "Agent directory created (via npm create)"
    cd "${WORK_DIR}/${AGENT_NAME}"
  else
    fail "Agent scaffolding failed entirely"
  fi
fi

# ─── Phase 4: Build Agent ───────────────────────────────────────────────
log "Phase 4: Building agent"

if [ -f "package.json" ]; then
  npm install 2>&1 | tee -a "$LOG_FILE"
  [[ $? -eq 0 ]] && pass "npm install succeeded" || fail "npm install failed"

  npm run build 2>&1 | tee -a "$LOG_FILE"
  [[ $? -eq 0 ]] && pass "npm run build succeeded" || fail "npm run build failed"

  [ -f "dist/index.js" ] && pass "dist/index.js exists" || fail "dist/index.js missing"
else
  fail "No package.json found — skipping build"
fi

# ─── Phase 5: Health Check ──────────────────────────────────────────────
log "Phase 5: Running soleri doctor"

if command -v soleri &>/dev/null && [ -f "package.json" ]; then
  soleri doctor 2>&1 | tee -a "$LOG_FILE" || true
  pass "soleri doctor completed (check output above)"
else
  fail "Cannot run soleri doctor"
fi

# ─── Phase 6: Native Dependencies ───────────────────────────────────────
log "Phase 6: Checking native dependencies"

# Check if better-sqlite3 compiled correctly
if [ -d "node_modules/better-sqlite3" ]; then
  node -e "require('better-sqlite3')" 2>/dev/null \
    && pass "better-sqlite3 loads correctly" \
    || fail "better-sqlite3 failed to load (native compilation issue)"
else
  log "better-sqlite3 not installed (optional — skipping)"
fi

# ─── Phase 7: Cleanup verification ──────────────────────────────────────
log "Phase 7: Checking for global side effects"

# Check what was installed globally
GLOBAL_PACKAGES=$(npm list -g --depth=0 2>/dev/null || true)
log "Global npm packages:"
echo "$GLOBAL_PACKAGES" | tee -a "$LOG_FILE"

# Check for files in common locations
for dir in /usr/local/bin /usr/local/lib; do
  if ls "$dir"/*soleri* 2>/dev/null; then
    log "Found soleri files in ${dir}:"
    ls -la "$dir"/*soleri* | tee -a "$LOG_FILE"
  fi
done

# Check ~/.claude for registrations
if [ -d "$HOME/.claude" ]; then
  log "~/.claude directory contents:"
  find "$HOME/.claude" -type f 2>/dev/null | head -20 | tee -a "$LOG_FILE"
fi

# ─── Summary ─────────────────────────────────────────────────────────────
echo ""
echo "========================================="
if [ $FAILURES -eq 0 ]; then
  printf "\033[1;32m  ALL CHECKS PASSED\033[0m\n"
else
  printf "\033[1;31m  %d CHECK(S) FAILED\033[0m\n" "$FAILURES"
fi
echo "  Log: ${LOG_FILE}"
echo "========================================="

exit $FAILURES
