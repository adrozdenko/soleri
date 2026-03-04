# @soleri/cli

Developer CLI for creating and managing Soleri AI agents.

Part of the [Soleri](https://soleri.dev) framework — building AI assistants that learn, remember, and grow with you.

## Quick Start

```bash
npx @soleri/cli create my-agent
```

The interactive wizard walks you through agent configuration: name, role, domains, principles, and greeting. When you're done, it scaffolds a complete agent project ready to build and run.

## Commands

| Command                           | Description                                            |
| --------------------------------- | ------------------------------------------------------ |
| `soleri create [name]`            | Interactive wizard to scaffold a new agent             |
| `soleri list [dir]`               | Show agents in a directory                             |
| `soleri add-domain <domain>`      | Add a knowledge domain to the agent in cwd             |
| `soleri install-knowledge <pack>` | Install knowledge packs from a local path              |
| `soleri dev`                      | Run agent in development mode (stdio MCP server)       |
| `soleri doctor`                   | Health check — Node, npm, tsx, agent, deps, build, MCP |
| `soleri hooks add <editor>`       | Generate editor hooks/config files                     |
| `soleri hooks remove <editor>`    | Remove editor hooks/config files                       |
| `soleri hooks list`               | Show installed editor hooks                            |

### Create

```bash
# Interactive wizard
soleri create my-agent

# Non-interactive with config file
soleri create --config agent.json
```

The config file follows the same schema as the wizard output:

```json
{
  "id": "my-agent",
  "name": "My Agent",
  "role": "Code Review Advisor",
  "description": "Reviews code for quality and security issues.",
  "domains": ["security", "code-quality"],
  "principles": ["Security is not optional"],
  "greeting": "Ready to review.",
  "outputDir": "."
}
```

### Editor Hooks

Generate editor-specific configuration files for your agent:

```bash
soleri hooks add claude-code   # .claude/settings.json with lifecycle hooks
soleri hooks add cursor        # .cursorrules
soleri hooks add windsurf      # .windsurfrules
soleri hooks add copilot       # .github/copilot-instructions.md
```

### Development Workflow

```bash
soleri create my-agent         # Scaffold
cd my-agent
npm install                    # Install dependencies
npm run build                  # Build
soleri dev                     # Run locally
soleri doctor                  # Verify everything works
soleri hooks add claude-code   # Add editor hooks
soleri add-domain security     # Add a domain later
```

## How It Works

The CLI wraps [`@soleri/forge`](../forge) — the same scaffolding engine that powers AI-driven agent creation via MCP. The CLI provides a terminal-first interface for the same operations.

## Development

```bash
# From monorepo root
npm install
npm run build --workspace=@soleri/cli
npm run test --workspace=@soleri/cli
```

## Requirements

- Node.js 18+
- npm 8+

## License

Apache-2.0
