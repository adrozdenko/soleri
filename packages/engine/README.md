# @soleri/engine

MCP server binary for Soleri agents. Reads `agent.yaml`, boots the Knowledge Engine (vault, brain, planner, curator), and registers all tools over stdio.

## Usage

```bash
npx @soleri/engine --agent ./agent.yaml
```

Or in `.mcp.json`:

```json
{
  "mcpServers": {
    "my-agent": {
      "command": "npx",
      "args": ["-y", "@soleri/engine", "--agent", "./agent.yaml"]
    }
  }
}
```

This package is a thin wrapper around `@soleri/core`'s engine binary.
