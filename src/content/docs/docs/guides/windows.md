---
title: 'Windows Setup'
description: 'Run Soleri agents natively on Windows using Git for Windows as the bash runtime.'
---

Soleri runs natively on Windows. Hook scripts execute via Git Bash, which ships with Git for Windows — already required by Claude Code.

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Git for Windows** — [git-scm.com](https://git-scm.com/download/win) (provides Git Bash)
- **Visual Studio Build Tools** — required for `better-sqlite3` native compilation

## Installing Build Tools

`better-sqlite3` compiles a native C++ addon. On Windows you need a C++ toolchain:

**Option A — Visual Studio Build Tools (recommended):**

1. Download [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. In the installer, select **"Desktop development with C++"**
3. Install and restart your terminal

**Option B — via npm:**

```bash
npm config set msvs_version 2022
```

If you already have Visual Studio 2019 or 2022 installed with the C++ workload, no extra steps are needed.

## Installation

```bash
npx @soleri/cli create my-brain
npx @soleri/cli install
npx @soleri/cli dev
```

These commands work identically on Windows, macOS, and Linux.

## Hook Packs

Soleri hook packs use bash scripts (`.sh` files). On Windows, Claude Code runs hooks through Git Bash by default — no extra configuration needed.

```bash
npx @soleri/cli hooks add-pack flock-guard
```

Lock files and temp directories use `${TMPDIR:-${TEMP:-/tmp}}`, which resolves correctly on Windows via the `TEMP` environment variable.

## Known Limitations

- **PowerShell hooks** — Soleri hook scripts are bash-only. Claude Code supports `"shell": "powershell"` per-hook, but Soleri packs don't ship PowerShell variants yet.
- **Launcher scripts** — `soleri install` creates launcher scripts in `/usr/local/bin` on Unix. On Windows this step is skipped. Use `npx @soleri/cli dev` to start your agent instead.
- **File permissions** — `chmod` calls are skipped on Windows. Scripts are executable by default.

## Troubleshooting

### `node-gyp` build failures

If `better-sqlite3` fails to compile:

```bash
# Verify build tools are installed
npm config get msvs_version

# Force a specific version
npm config set msvs_version 2022

# Rebuild
npm rebuild better-sqlite3
```

### Git Bash not found

Claude Code expects Git for Windows on PATH. Verify:

```bash
where git
# Should show: C:\Program Files\Git\cmd\git.exe
```

If hooks fail with "bash not found", ensure Git for Windows is installed and its `bin` directory is on your system PATH.

### Path separator issues

Soleri uses `path.join()` internally, so paths are cross-platform. If you see path errors in custom scripts, use forward slashes (`/`) or the `path` module — avoid hardcoded backslashes.
