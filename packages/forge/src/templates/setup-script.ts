import type { AgentConfig } from '../types.js';

/**
 * Generate a scripts/setup.sh for the scaffolded agent.
 * Handles: Node.js check, build, and host-specific MCP registration.
 */
export function generateSetupScript(config: AgentConfig): string {
  const setupTarget = config.setupTarget ?? 'claude';
  const claudeSetup = setupTarget === 'claude' || setupTarget === 'both' || setupTarget === 'all';
  const codexSetup = setupTarget === 'codex' || setupTarget === 'both' || setupTarget === 'all';
  const opencodeSetup = setupTarget === 'opencode' || setupTarget === 'all';
  const hostParts = [
    ...(claudeSetup ? ['Claude Code'] : []),
    ...(codexSetup ? ['Codex'] : []),
    ...(opencodeSetup ? ['OpenCode'] : []),
  ];
  const hostLabel = hostParts.join(' + ');

  const claudeSection = claudeSetup
    ? `
# Check Claude Code
if ! command -v claude &>/dev/null; then
  echo ""
  echo "Warning: 'claude' command not found."
  echo "Install Claude Code first: https://docs.anthropic.com/en/docs/claude-code"
  echo ""
  echo "After installing, re-run this setup script."
  exit 1
fi
echo "[ok] Claude Code found"

# Register MCP server with Claude Code
echo ""
echo "Registering ${config.name} with Claude Code..."
claude mcp add --scope user "$AGENT_NAME" -- node "$AGENT_DIR/dist/index.js"
echo "[ok] Registered ${config.name} as MCP server (Claude Code)"

# Configure PreCompact hook for session capture
SETTINGS_FILE="$HOME/.claude/settings.json"
echo ""
echo "Configuring Claude session capture hook..."

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
        "prompt": "Before context is compacted, capture a session summary by calling ${config.id}_core op:session_capture with a brief summary of what was accomplished, the topics covered, files modified, and tools used."
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
    node -e "
      const fs = require('fs');
      const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));
      if (!settings.hooks) settings.hooks = {};
      if (!settings.hooks.PreCompact) settings.hooks.PreCompact = [];
      settings.hooks.PreCompact.push({
        type: 'prompt',
        prompt: 'Before context is compacted, capture a session summary by calling ${config.id}_core op:session_capture with a brief summary of what was accomplished, the topics covered, files modified, and tools used.'
      });
      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2) + '\\n');
    "
    echo "[ok] Added PreCompact hook to $SETTINGS_FILE"
  fi
fi

# Install skills to ~/.claude/commands/
SKILLS_DIR="$AGENT_DIR/skills"
COMMANDS_DIR="$HOME/.claude/commands"

if [ -d "$SKILLS_DIR" ]; then
  echo ""
  echo "Installing skills for Claude Code..."
  mkdir -p "$COMMANDS_DIR"
  skill_installed=0
  skill_skipped=0
  for skill_dir in "$SKILLS_DIR"/*/; do
    [ -d "$skill_dir" ] || continue
    skill_file="$skill_dir/SKILL.md"
    [ -f "$skill_file" ] || continue
    skill_name="$(basename "$skill_dir")"
    dest="$COMMANDS_DIR/$skill_name.md"
    if [ -f "$dest" ]; then
      skill_skipped=$((skill_skipped + 1))
    else
      cp "$skill_file" "$dest"
      skill_installed=$((skill_installed + 1))
    fi
  done
  echo "[ok] Claude skills: $skill_installed installed, $skill_skipped already present"
fi
`
    : '';

  const hookPackSection =
    claudeSetup && config.hookPacks?.length
      ? `
# Install hook packs to global ~/.claude/
AGENT_CLAUDE_DIR="$AGENT_DIR/.claude"
GLOBAL_CLAUDE_DIR="$HOME/.claude"

if [ -d "$AGENT_CLAUDE_DIR" ]; then
  echo ""
  echo "Installing hook packs..."
  mkdir -p "$GLOBAL_CLAUDE_DIR"
  installed=0
  skipped=0
  for hook_file in "$AGENT_CLAUDE_DIR"/hookify.*.local.md; do
    [ -f "$hook_file" ] || continue
    dest="$GLOBAL_CLAUDE_DIR/$(basename "$hook_file")"
    if [ -f "$dest" ]; then
      skipped=$((skipped + 1))
    else
      cp "$hook_file" "$dest"
      installed=$((installed + 1))
    fi
  done
  echo "[ok] Hooks: $installed installed, $skipped already present"
fi
`
      : '';

  const codexSection = codexSetup
    ? `
# Register MCP server with Codex
echo ""
echo "Registering ${config.name} with Codex..."
mkdir -p "$HOME/.codex"
CODEX_CONFIG="$HOME/.codex/config.toml"
AGENT_DIST="$AGENT_DIR/dist/index.js"

CODEX_CONFIG="$CODEX_CONFIG" AGENT_NAME="$AGENT_NAME" AGENT_DIST="$AGENT_DIST" node <<'NODE'
const fs = require('node:fs');
const path = process.env.CODEX_CONFIG;
const agentName = process.env.AGENT_NAME;
const distPath = process.env.AGENT_DIST;

let content = '';
if (fs.existsSync(path)) {
  content = fs.readFileSync(path, 'utf-8');
}

const header = '[mcp_servers.' + agentName + ']';
const block = header + '\\ncommand = "node"\\nargs = ["' + distPath + '"]\\n';
const start = content.indexOf(header);

if (start === -1) {
  const trimmed = content.trimEnd();
  content = trimmed.length === 0 ? block + '\\n' : trimmed + '\\n\\n' + block + '\\n';
} else {
  const afterHeader = start + header.length;
  const tail = content.slice(afterHeader);
  const nextSectionOffset = tail.search(/\\n\\[[^\\]]+\\]/);
  const end = nextSectionOffset === -1 ? content.length : afterHeader + nextSectionOffset;
  content = content.slice(0, start).trimEnd() + '\\n\\n' + block + '\\n' + content.slice(end).trimStart();
}

content = content.replace(/\\n{3,}/g, '\\n\\n');
fs.writeFileSync(path, content, 'utf-8');
NODE
echo "[ok] Registered ${config.name} as MCP server (Codex)"

# Install skills to ~/.codex/skills/
SKILLS_DIR="$AGENT_DIR/skills"
CODEX_SKILLS_DIR="$HOME/.codex/skills"

if [ -d "$SKILLS_DIR" ]; then
  echo ""
  echo "Installing skills for Codex..."
  mkdir -p "$CODEX_SKILLS_DIR"
  skill_installed=0
  skill_skipped=0
  for skill_dir in "$SKILLS_DIR"/*/; do
    [ -d "$skill_dir" ] || continue
    skill_file="$skill_dir/SKILL.md"
    [ -f "$skill_file" ] || continue
    skill_name="$(basename "$skill_dir")"
    dest_dir="$CODEX_SKILLS_DIR/$AGENT_NAME-$skill_name"
    dest_file="$dest_dir/SKILL.md"
    if [ -f "$dest_file" ]; then
      skill_skipped=$((skill_skipped + 1))
    else
      mkdir -p "$dest_dir"
      cp "$skill_file" "$dest_file"
      skill_installed=$((skill_installed + 1))
    fi
  done
  echo "[ok] Codex skills: $skill_installed installed, $skill_skipped already present"
fi
`
    : '';

  const opencodeSection = opencodeSetup
    ? `
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
echo "Registering ${config.name} with OpenCode..."
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
    const stripped = raw.replace(/^\\s*\\/\\/.*$/gm, '');
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

fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\\n', 'utf-8');
NODE
echo "[ok] Registered ${config.name} as MCP server (OpenCode)"

# Create launcher script — type "${config.id}" to start OpenCode
LAUNCHER_PATH="/usr/local/bin/$AGENT_NAME"
LAUNCHER_CONTENT="#!/usr/bin/env bash
# Soleri agent launcher — starts OpenCode with $AGENT_NAME MCP agent
cd \\"$AGENT_DIR\\" || exit 1
exec opencode \\"\\$@\\""

if [ -w "/usr/local/bin" ]; then
  echo "$LAUNCHER_CONTENT" > "$LAUNCHER_PATH"
  chmod +x "$LAUNCHER_PATH"
  echo "[ok] Launcher created: type \\"${config.id}\\" to start OpenCode"
else
  echo "$LAUNCHER_CONTENT" > "$AGENT_DIR/scripts/$AGENT_NAME"
  chmod +x "$AGENT_DIR/scripts/$AGENT_NAME"
  if command -v sudo &>/dev/null; then
    sudo ln -sf "$AGENT_DIR/scripts/$AGENT_NAME" "$LAUNCHER_PATH" 2>/dev/null && \\
      echo "[ok] Launcher created: type \\"${config.id}\\" to start OpenCode" || \\
      echo "Note: Run 'sudo ln -sf $AGENT_DIR/scripts/$AGENT_NAME $LAUNCHER_PATH' to enable \\"${config.id}\\" command"
  else
    echo "Note: Add $AGENT_DIR/scripts to PATH, or symlink $AGENT_DIR/scripts/$AGENT_NAME to /usr/local/bin/$AGENT_NAME"
  fi
fi
`
    : '';

  const nextSteps = [
    'echo ""',
    'echo "=== Setup Complete ==="',
    'echo ""',
    'echo "Next:"',
    ...(claudeSetup
      ? ['echo "  - Start a new Claude Code session (or restart if one is open)"']
      : []),
    ...(codexSetup ? ['echo "  - Start a new Codex session (or restart if one is open)"'] : []),
    ...(opencodeSetup
      ? ['echo "  - Start a new OpenCode session (or restart if one is open)"']
      : []),
    `echo "  - Say: \\"Hello, ${config.name}!\\""`,
    'echo ""',
    `echo "${config.name} is ready."`,
  ].join('\n');

  return `#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_NAME="${config.id}"

echo "=== ${config.name} Setup (${hostLabel}) ==="
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
${claudeSection}
${hookPackSection}
${codexSection}
${opencodeSection}
${nextSteps}
`;
}
