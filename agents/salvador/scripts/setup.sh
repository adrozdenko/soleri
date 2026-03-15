#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_NAME="salvador"

echo "=== Salvador Setup (OpenCode) ==="
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is not installed. Install Node.js 18+ first."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18+ required (found v$(node -v))."
  exit 1
fi
echo "[ok] Node.js $(node -v)"

# Check if built
if [ ! -f "$AGENT_DIR/dist/index.js" ]; then
  echo ""
  echo "Building Salvador..."
  cd "$AGENT_DIR"
  npm install
  npm run build
  echo "[ok] Built successfully"
else
  echo "[ok] Already built"
fi




# Check and install OpenCode (Soleri fork with title branding)
if ! command -v opencode &>/dev/null; then
  echo ""
  INSTALLED=false
  # Try Go install from Soleri fork (supports title branding)
  if command -v go &>/dev/null; then
    echo "Installing OpenCode (Soleri fork) via go install..."
    if go install github.com/adrozdenko/opencode@latest 2>/dev/null; then
      if command -v opencode &>/dev/null; then
        echo "[ok] OpenCode installed from Soleri fork ($(opencode --version 2>/dev/null || echo 'installed'))"
        INSTALLED=true
      fi
    fi
  fi
  # Fallback: upstream npm package (no title branding)
  if [ "$INSTALLED" = false ]; then
    echo "Installing OpenCode via npm (upstream — title branding requires Go)..."
    npm install -g opencode-ai
    if command -v opencode &>/dev/null; then
      echo "[ok] OpenCode installed ($(opencode --version 2>/dev/null || echo 'unknown version'))"
    else
      echo ""
      echo "Warning: Could not install OpenCode automatically."
      echo "Install manually using one of:"
      echo "  go install github.com/adrozdenko/opencode@latest  (recommended — includes title branding)"
      echo "  npm install -g opencode-ai  (upstream)"
      echo ""
    fi
  fi
else
  echo "[ok] OpenCode found ($(opencode --version 2>/dev/null || echo 'installed'))"
fi

# Register MCP server with OpenCode
echo ""
echo "Registering Salvador with OpenCode..."
OPENCODE_CONFIG="$HOME/.opencode.json"
AGENT_DIST="$AGENT_DIR/dist/index.js"

OPENCODE_CONFIG="$OPENCODE_CONFIG" AGENT_NAME="$AGENT_NAME" AGENT_DIST="$AGENT_DIST" node <<'NODE'
const fs = require('node:fs');
const path = process.env.OPENCODE_CONFIG;
const agentName = process.env.AGENT_NAME;
const distPath = process.env.AGENT_DIST;

let config = {};
if (fs.existsSync(path)) {
  try {
    const raw = fs.readFileSync(path, 'utf-8');
    const stripped = raw.replace(/^\s*\/\/.*$/gm, '');
    config = JSON.parse(stripped);
  } catch {
    config = {};
  }
}

if (!config.mcp || typeof config.mcp !== 'object') {
  config.mcp = {};
}

config.mcp[agentName] = {
  type: 'local',
  command: ['node', distPath],
  enabled: true,
};

fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf-8');
NODE
echo "[ok] Registered Salvador as MCP server (OpenCode)"

# Create launcher script — type "salvador" to start OpenCode
LAUNCHER_PATH="/usr/local/bin/$AGENT_NAME"
LAUNCHER_CONTENT="#!/usr/bin/env bash
# Soleri agent launcher — starts OpenCode with $AGENT_NAME MCP agent
cd \"$AGENT_DIR\" || exit 1
exec opencode \"\$@\""

if [ -w "/usr/local/bin" ]; then
  echo "$LAUNCHER_CONTENT" > "$LAUNCHER_PATH"
  chmod +x "$LAUNCHER_PATH"
  echo "[ok] Launcher created: type \"salvador\" to start OpenCode"
else
  echo "$LAUNCHER_CONTENT" > "$AGENT_DIR/scripts/$AGENT_NAME"
  chmod +x "$AGENT_DIR/scripts/$AGENT_NAME"
  if command -v sudo &>/dev/null; then
    sudo ln -sf "$AGENT_DIR/scripts/$AGENT_NAME" "$LAUNCHER_PATH" 2>/dev/null && \
      echo "[ok] Launcher created: type \"salvador\" to start OpenCode" || \
      echo "Note: Run 'sudo ln -sf $AGENT_DIR/scripts/$AGENT_NAME $LAUNCHER_PATH' to enable \"salvador\" command"
  else
    echo "Note: Add $AGENT_DIR/scripts to PATH, or symlink $AGENT_DIR/scripts/$AGENT_NAME to /usr/local/bin/$AGENT_NAME"
  fi
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next:"
echo "  - Start a new OpenCode session (or restart if one is open)"
echo "  - Say: \"Hello, Salvador!\""
echo ""
echo "Salvador is ready."
