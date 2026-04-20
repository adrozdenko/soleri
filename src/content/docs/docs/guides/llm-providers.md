---
title: LLM Providers
description: How Soleri routes LLM calls across Claude Code CLI, Anthropic SDK, and OpenAI — and how to override.
---

Soleri uses LLMs for the curator (quality gate, classifier), vault auto-linking, knowledge synthesis, and contradiction evaluation. Embeddings use a separate provider (Voyage AI) and are not affected by anything on this page.

## Default provider chain

For every call, Soleri tries providers in this order until one succeeds:

| # | Provider | Default model | Requires |
|---|----------|---------------|----------|
| 1 | `claude-cli` | `claude-sonnet-4-6` (quality) / `claude-haiku-4-5` (classify) | `claude` CLI on `PATH`, authenticated Claude Code session |
| 2 | `anthropic` | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` |
| 3 | `openai` | `gpt-4o-mini` | `OPENAI_API_KEY` |

If none of the three are available, the caller degrades gracefully (quality gate returns `ACCEPT`, classifier returns no suggestions, vault-linking skips).

The fallback chain runs per-call. If `claude-cli` fails (process exit non-zero, malformed output, timeout, or simply not installed), the next provider is attempted automatically with no caller-side change.

## Why claude-cli is the default

Routing through `claude -p --output-format json --model X` lets a Soleri user with an authenticated Claude Code subscription run all curator LLM work without provisioning OpenAI or Anthropic API keys. There is no per-token billing — the work runs against the existing subscription.

Trade-offs:

- **Pro:** zero API key setup, no separate billing, uses the model the user already has access to.
- **Con:** subprocess overhead (~50–200ms per call vs ~30–100ms for HTTP).
- **Con:** depends on the `claude` binary being installed and on `PATH`. The probe runs once at startup and caches the result.
- **Risk:** Anthropic could disable third-party use of CLI passthrough at any time. The fallback chain absorbs this — installs with API keys configured will continue to work.

## Detection and the MCP PATH gotcha

At startup the LLM client probes `claude --version` once, with a 2-second timeout, and caches the result. Subsequent calls skip the probe.

If you run Soleri inside an MCP server spawned by Claude Code itself, the spawned process **does not inherit your shell's `PATH`**. The `claude` binary may exist but not be findable. Fix one of:

```bash
# Option A — set CLAUDE_CLI_PATH in your agent's env
export CLAUDE_CLI_PATH=/absolute/path/to/claude

# Option B — add to agent.yaml
env:
  CLAUDE_CLI_PATH: /absolute/path/to/claude
```

If detection fails, Soleri logs a one-line warning to stderr and falls back to the next provider in the chain. No retries.

## Disabling claude-cli explicitly

Set `SOLERI_DISABLE_CLAUDE_CLI=1` to skip the claude-cli tier entirely. Useful for:

- CI environments where you want deterministic behavior from API providers
- Test suites isolating provider-specific assertions
- Running purely on API keys despite having Claude Code installed

## Custom routes per agent

Override the default routing by writing `~/.{agentId}/model-routing.json`:

```json
{
  "routes": [
    { "caller": "quality-gate", "task": "evaluate", "model": "gpt-4o", "provider": "openai" },
    { "caller": "classifier", "task": "classify", "model": "claude-haiku-4-5-20251001", "provider": "anthropic" }
  ],
  "defaultOpenAIModel": "gpt-4o-mini",
  "defaultAnthropicModel": "claude-sonnet-4-20250514"
}
```

The `provider` field accepts `claude-cli`, `anthropic`, or `openai`. Routes that match the caller (and optionally task) take effect; the fallback chain still runs if the chosen provider fails.

## What this does NOT change

- **Embeddings** stay on Voyage AI (`voyage-3.5`, 1024 dims). Configured via `VOYAGE_API_KEY`. See the embedding provider docs.
- **Existing API key callers** keep working. If you have only `OPENAI_API_KEY` set and no `claude` binary, every call goes straight to OpenAI as before.
