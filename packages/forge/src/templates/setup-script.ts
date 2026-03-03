import type { AgentConfig } from '../types.js';

/**
 * Generate a scripts/setup.sh for the scaffolded agent.
 * Handles: Node.js check, build, Claude Code MCP server registration.
 */
export function generateSetupScript(config: AgentConfig): string {
  return `#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_NAME="${config.id}"

echo "=== ${config.name} Setup ==="
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
  echo "Building ${config.name}..."
  cd "$AGENT_DIR"
  npm install
  npm run build
  echo "[ok] Built successfully"
else
  echo "[ok] Already built"
fi

# Check Claude Code
if ! command -v claude &>/dev/null; then
  echo ""
  echo "Warning: 'claude' command not found."
  echo "Install Claude Code first: https://docs.anthropic.com/en/docs/claude-code"
  echo ""
  echo "After installing, add ${config.name} manually to ~/.claude/settings.json"
  echo "(see README.md for the JSON config)"
  exit 1
fi
echo "[ok] Claude Code found"

# Register MCP server with Claude Code
echo ""
echo "Registering ${config.name} with Claude Code..."

claude mcp add --scope user "$AGENT_NAME" -- node "$AGENT_DIR/dist/index.js"
echo "[ok] Registered ${config.name} as MCP server"

# Configure PreCompact hook for session capture
SETTINGS_FILE="$HOME/.claude/settings.json"
echo ""
echo "Configuring session capture hook..."

if [ ! -d "$HOME/.claude" ]; then
  mkdir -p "$HOME/.claude"
fi

if [ ! -f "$SETTINGS_FILE" ]; then
  cat > "$SETTINGS_FILE" << SETTINGS
{
  "hooks": {
    "PreCompact": [
      {
        "type": "prompt",
        "prompt": "Before context is compacted, capture a session summary by calling ${config.id.replace(/-/g, '_')}_core op:session_capture with a brief summary of what was accomplished, the topics covered, files modified, and tools used."
      }
    ]
  }
}
SETTINGS
  echo "[ok] Created $SETTINGS_FILE with PreCompact hook"
else
  if grep -q "PreCompact" "$SETTINGS_FILE" 2>/dev/null; then
    echo "[ok] PreCompact hook already configured — skipping"
  else
    # Use node to safely merge hook into existing settings
    node -e "
      const fs = require('fs');
      const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));
      if (!settings.hooks) settings.hooks = {};
      if (!settings.hooks.PreCompact) settings.hooks.PreCompact = [];
      settings.hooks.PreCompact.push({
        type: 'prompt',
        prompt: 'Before context is compacted, capture a session summary by calling ${config.id.replace(/-/g, '_')}_core op:session_capture with a brief summary of what was accomplished, the topics covered, files modified, and tools used.'
      });
      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2) + '\\n');
    "
    echo "[ok] Added PreCompact hook to $SETTINGS_FILE"
  fi
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next:"
echo "  1. Start a new Claude Code session (or restart if one is open)"
echo "  2. Say: \\"Hello, ${config.name}!\\""
echo ""
echo "${config.name} will activate and guide you from there."
`;
}
