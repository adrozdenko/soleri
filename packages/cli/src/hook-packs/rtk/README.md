# RTK Hook Pack

Reduces LLM token usage by 60-90% by routing shell commands through [RTK](https://github.com/rtk-ai/rtk), a Rust-based CLI proxy that compresses verbose command output.

## How it works

A PreToolUse hook intercepts Bash commands and rewrites them through RTK:

```
git status  →  rtk git status  →  "M 3 files" (instead of 15 lines)
npm test    →  rtk npm test    →  "2 failed" (instead of 200+ lines)
```

RTK supports 70+ commands across git, JS/TS, Python, Go, Ruby, Docker, and file operations.

## Prerequisites

- [RTK](https://github.com/rtk-ai/rtk) >= 0.23.0 (`brew install rtk-ai/tap/rtk` or `cargo install rtk`)
- `jq` (usually pre-installed on macOS/Linux)

## Install

```bash
soleri hooks add-pack rtk
```

## Uninstall

```bash
soleri hooks remove-pack rtk
```
