---
name: soleri-yolo-mode
tier: default
description: 'Triggers: "yolo", "autonomous", "skip approvals", "full auto", "hands off". Autonomous execution skipping approval gates, safety invariants preserved.'
---

## Announce

When this skill is invoked, immediately say:
> "Using **Yolo Mode** skill (4 steps). Starting with: ### Step 1: Flip Harness Permissions"

# YOLO Mode

Autonomous execution without approval gates. Plans execute immediately — no Gate 1, no Gate 2, no confirmation prompts.

**Announce at start:** "I'm activating YOLO mode — autonomous execution with safety invariants intact."

## Pre-Activation (idempotent, runs every time)

Before running the Activation Flow, ensure the **SessionStart orphan-warning hook** is installed. This is a separate, permanent hook (not tied to the yolo-safety pack). It prints a banner at every Claude Code session start if `.yolo-harness-state.json` exists, so a crashed session can never silently leak YOLO into the next launch.

If no state file exists, the hook is free — it prints nothing.

1. Check if `~/.claude/hooks/yolo-state-check.sh` exists. If yes, proceed to step 3.
2. Write the script content below to `~/.claude/hooks/yolo-state-check.sh`, then `chmod +x` it:
   ```sh
   #!/bin/sh
   STATE="$HOME/.claude/.yolo-harness-state.json"
   if [ -f "$STATE" ]; then
     TS=$(jq -r '.activatedAt // "unknown"' "$STATE" 2>/dev/null)
     SAFETY=$(jq -r '.safetyPackActivated // false' "$STATE" 2>/dev/null)
     jq -n --arg ts "$TS" --arg s "$SAFETY" '
       ("⚠️ YOLO MODE is still active (activated " + $ts + ", safetyPack=" + $s + "). Harness permissions bypassed. Say \"exit YOLO\" to deactivate cleanly, or \"check yolo state\" to inspect.") as $msg
       | {
         systemMessage: $msg,
         hookSpecificOutput: {
           hookEventName: "SessionStart",
           additionalContext: $msg
         }
       }'
   fi
   ```
3. Install the `SessionStart` hook entry via this idempotent `jq` one-liner. It skips if already present, preserves other SessionStart entries, and writes atomically (original file is preserved if `jq` fails):
   ```bash
   TMP=$(mktemp) && jq '
     .hooks //= {} | .hooks.SessionStart //= [] |
     if any(.hooks.SessionStart[]?.hooks[]?; (.command // "" | tostring) | contains("yolo-state-check.sh"))
     then .
     else .hooks.SessionStart += [{"hooks":[{"type":"command","command":"sh ~/.claude/hooks/yolo-state-check.sh"}]}]
     end
   ' ~/.claude/settings.json > "$TMP" && mv "$TMP" ~/.claude/settings.json
   ```
   Verify: `jq '.hooks.SessionStart' ~/.claude/settings.json | grep yolo-state-check.sh` must match. If `jq` errored (non-zero exit), `mv` never ran — `settings.json` is untouched. Report the exact error and stop.

The hook is now permanent across sessions. Proceed to the Activation Flow.

## Activation Flow

### Step 1: Flip Harness Permissions to Bypass

The Claude Code harness has its own permission layer (`~/.claude/settings.json` → `permissions.defaultMode`). YOLO needs this set to `"bypassPermissions"` so tool calls stop getting denied/prompted. The `deny` list and PreToolUse hooks stay intact — those are the safety invariants, not the prompts.

**Heads up:** the state file and settings changes are **user-global**, not per-session. Every running Claude Code session on this account shares them. That's why orphan detection matters — a crashed session that never ran Harness Restore will leave the machine in YOLO without telling the next session.

**Pre-flight: orphan-state detection.**

1. Check if `~/.claude/.yolo-harness-state.json` exists.
2. **If missing:** proceed to "Fresh activation" below.
3. **If present — diagnose, don't clobber:**
   - Read the file. Note `activatedAt` and `safetyPackActivated`.
   - Read `~/.claude/settings.json`. Note current `permissions.defaultMode`.
   - Classify by age of `activatedAt`: under 60 minutes = *"likely active in another session"*; over 60 minutes = *"likely orphan from a crashed or unexpectedly-ended session"*.
   - Classify consistency: if `defaultMode` in settings.json is currently `"bypassPermissions"`, state is **consistent**; otherwise **inconsistent** (previous run never restored settings).
   - Report to user exactly, using this template:
     ```
     Found existing YOLO state:
     - activatedAt: <ISO> (<N> minutes ago — {likely active | likely orphan})
     - safetyPackActivated: <true|false>
     - settings.json defaultMode: <value>
     - consistency: {consistent | inconsistent}

     Options:
     1. Abort — leave everything as-is. Pick this if YOLO is running in another live session.
     2. Recover — treat as orphan: run Harness Restore to tear down the stale state file, hook wiring, and settings flip, then re-run Step 1 fresh.
     ```
   - **Stop and wait for the user's choice.** Do not auto-decide. Do not write the state file. Do not flip the harness.

**Fresh activation (only after pre-flight passes):**

Run these `jq`-based Bash commands — atomic, no hand JSON editing. Each step writes to a temp file first; if `jq` errors, `mv` never runs and the original file is preserved.

```bash
# 1. Capture current defaultMode (treat missing key as "default")
PREV=$(jq -r '.permissions.defaultMode // "default"' ~/.claude/settings.json)

# 2. Write the state file
jq -n --arg prev "$PREV" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{previousDefaultMode: $prev, activatedAt: $ts, safetyPackActivated: false}' \
  > ~/.claude/.yolo-harness-state.json

# 3. Flip defaultMode to bypassPermissions (atomic via temp file)
TMP=$(mktemp) && jq '.permissions.defaultMode = "bypassPermissions"' ~/.claude/settings.json > "$TMP" && mv "$TMP" ~/.claude/settings.json
```

Verify: `jq -r '.permissions.defaultMode' ~/.claude/settings.json` must print `bypassPermissions`. Do not touch `allow`, `deny`, or any other keys.

**Note on reload:** Claude Code usually hot-reloads `defaultMode`. If the first few tool calls still hit prompts, the user can open `/permissions` once to force a reload — tell them only if it happens.

### Step 2: Install & Activate YOLO Safety Hook Pack

The hook pack (`anti-deletion.sh`) is what makes YOLO survivable. It intercepts destructive Bash commands. For `rm`, it **copies files to `~/.soleri/staging/<timestamp>/` first, then blocks** — the originals stay intact and the staged copy is your recovery path. Without this pack active, a bad `rm` in bypass mode is unrecoverable.

**Note:** `soleri hooks list-packs` checking ✓ only means the script is on disk. The PreToolUse Bash wiring in `~/.claude/settings.json` is separate — `add-pack` is what wires it. Run `add-pack` every time; it's idempotent.

**Activate:**

1. Run `soleri hooks add-pack yolo-safety` via Bash. This installs the script (if missing) and wires the `PreToolUse → Bash` entry in `~/.claude/settings.json`.
2. Verify: `soleri hooks list-packs | grep yolo-safety` — must show ✓.
3. Flip `safetyPackActivated` to `true` in the state file via jq:
   ```bash
   TMP=$(mktemp) && jq '.safetyPackActivated = true' ~/.claude/.yolo-harness-state.json > "$TMP" && mv "$TMP" ~/.claude/.yolo-harness-state.json
   ```

**HARD-GATE: Refuse to proceed if `add-pack` fails or verification doesn't confirm.** Report exactly what failed to the user. If you already flipped the harness in Step 1, run Harness Restore now before refusing.

**Reload caveat — do not skip this warning to the user.** `add-pack` wrote the PreToolUse Bash hook to `~/.claude/settings.json`, but Claude Code's hook watcher only reliably reloads hooks for sessions whose settings had hooks present at session start. Mid-session installs may land on disk without the harness loading them. **This is a safety-critical gap** — if the hook isn't loaded, destructive Bash commands in this session won't be staged or blocked. Tell the user verbatim:

> "Safety hook is wired in `settings.json`, but Claude Code may not hot-reload it this session. To be safe: type `/hooks` once to force-reload, or restart Claude. Otherwise destructive commands in this turn could slip through the net."

Do not claim "safety hook active" without this caveat.

### Step 3: Morph to YOLO Mode

```
YOUR_AGENT_control op:morph
  params: { mode: "YOLO-MODE", hookPackInstalled: true }
```

**Important:**
- `morph` lives on **`YOUR_AGENT_control`**, not `YOUR_AGENT_core`. Calling the wrong facade returns `Unknown operation "morph"`.
- `hookPackInstalled: true` is **required** for YOLO-MODE activation. The intent router blocks the mode switch otherwise, even if Step 2 successfully wired the pack. Passing `true` here asserts to the router that the caller (this skill) has verified the pack is installed.
- On success, the response's `currentMode` should be `"YOLO-MODE"`. If it's still `"GENERAL-MODE"` with `blocked: true`, something went wrong — do not proceed to Step 4; run Harness Restore.

### Step 4: Confirm to User (with safety briefing)

State this verbatim — the user needs to understand scope, blast radius, persistence, and recovery:

> ⚠️ **YOLO MODE ACTIVE — read this.**
>
> - **Scope:** harness permissions bypassed; approval gates off. Claude now executes **Bash, Write, Edit, and MCP tool calls** without asking. **Protected paths** (`.git`, `.claude`, `.vscode`, `.idea`, `.husky`) still prompt for writes — that's Claude Code's built-in floor, not something we control.
> - **Still blocked (Bash only):** `git push --force`, `git reset --hard`, `git clean`, `git checkout -- .`, `git restore .`, `mv ~/projects/*`, SQL `DROP TABLE`, `docker rm` / `rmi`, and bare `rm` (see below).
> - **`rm` staging — Bash only:** any `rm` via **Bash** is intercepted. Files are *copied* to `~/.soleri/staging/<timestamp>/` **before** the command is blocked. Originals untouched; staged copy is your receipt. Recovery: `soleri staging list` → `soleri staging restore`. Staging auto-cleans after 7 days.
> - **Blind spot — read this twice:** direct `Write` / `Edit` tool calls that overwrite files are **not** staged. If Claude clobbers `package.json` via the Edit tool, there is no automatic backup. Use `git` frequently as your real safety net.
> - **Persistence — critical:** YOLO is **user-global and persists across sessions**. Closing this terminal does NOT deactivate it. You MUST say **"exit YOLO"** before quitting, or the next Claude launch inherits YOLO without the active user knowing. The SessionStart orphan hook will warn on next launch, but don't rely on it — deactivate cleanly.
> - **Hot-reload caveat:** if tool calls still prompt for permission or `rm` commands are executing without staging, open `/permissions` once (harness reload) and/or `/hooks` once (safety-hook reload). The first turn after activation is the most fragile.

## What Gets Skipped

- Plan approval Gate 1 (`op:approve_plan`)
- Plan approval Gate 2 (`op:plan_split` confirmation)
- User confirmation prompts between steps
- "Ready for feedback?" checkpoints

## What Is NEVER Skipped

- **`op:orchestrate_complete`** — knowledge capture runs on every task, always
- **Vault search before decisions** — check vault for patterns/anti-patterns before acting
- **YOLO Safety Hook Pack** — intercepts destructive commands (force push, drop table, rm -rf, reset --hard)
- **Test execution** — tests still run; failures still block completion
- **`op:plan_reconcile`** — drift reports still generated after execution

## Exit Conditions

YOLO mode deactivates when any of these occur:

- User says "exit YOLO", "stop YOLO", or "normal mode"
- Session ends
- Explicit deactivation: `YOUR_AGENT_control op:morph params: { mode: "GENERAL-MODE" }`
- Safety hook intercepts a destructive command (auto-exits, requires re-activation)

**Every exit path MUST run the Harness Restore block below before confirming exit to the user.**

## Harness Restore

When YOLO mode deactivates for any reason, restore both the safety hook pack wiring and the harness permission mode:

1. Read `~/.claude/.yolo-harness-state.json`. If the file is missing, skip — nothing to restore (YOLO was never activated or already torn down).
2. **If `safetyPackActivated` is `true`:** run `soleri hooks remove-pack yolo-safety` via Bash. This removes the PreToolUse Bash entry from `~/.claude/settings.json`. Verify with `soleri hooks list-packs` that yolo-safety no longer shows ✓ (or is reported as uninstalled).
3. Restore the previous `defaultMode` via jq (atomic; original preserved on error):
   ```bash
   PREV=$(jq -r '.previousDefaultMode' ~/.claude/.yolo-harness-state.json)
   TMP=$(mktemp) && jq --arg p "$PREV" '.permissions.defaultMode = $p' ~/.claude/settings.json > "$TMP" && mv "$TMP" ~/.claude/settings.json
   ```
4. Delete `~/.claude/.yolo-harness-state.json`.
5. Confirm to user: "YOLO deactivated. Safety hook pack removed. Harness permissions restored to `<previousDefaultMode>`. Any `~/.soleri/staging/*` backups from this session are still on disk — `soleri staging list` to inspect."

If the state file exists but `settings.json` is missing or malformed, or if `remove-pack` fails, tell the user what you found and stop — don't guess. Manual recovery: user can set `permissions.defaultMode` back to their prior value by hand, and re-run `soleri hooks remove-pack yolo-safety`.

## Recovery From Failed Harness Restore

If Harness Restore itself fails partway through (e.g., `remove-pack` errors, or `settings.json` is malformed and can't be parsed), the machine is in a broken half-yolo state. Recover manually, in this order:

1. **Inspect current state:**
   - `cat ~/.claude/.yolo-harness-state.json` — note `previousDefaultMode` and `safetyPackActivated`. Copy these values somewhere safe before touching anything.
   - `cat ~/.claude/settings.json` — confirm it's valid JSON (`jq . ~/.claude/settings.json`). If it fails to parse, fix the syntax first — everything else depends on it.

2. **Fix `~/.claude/settings.json`** — prefer the `jq` recipes below over hand-editing.

   **Restore defaultMode:**
   ```bash
   PREV=$(jq -r '.previousDefaultMode // "default"' ~/.claude/.yolo-harness-state.json)
   TMP=$(mktemp) && jq --arg p "$PREV" '.permissions.defaultMode = $p' ~/.claude/settings.json > "$TMP" && mv "$TMP" ~/.claude/settings.json
   ```

   **If `safetyPackActivated` was `true`, remove ONLY the yolo-safety PreToolUse Bash entry.** This is what it looks like in `settings.json`:
   ```json
   "PreToolUse": [
     { "matcher": "Bash|bash", "hooks": [{ "type": "command", "command": "lean-ctx hook rewrite" }] },
     { "matcher": "Bash", "hooks": [{ "type": "command", "command": "sh ~/.claude/hooks/anti-deletion.sh", "timeout": 10 }] }
   ]
   ```
   After removal, only the non-yolo-safety entries remain:
   ```json
   "PreToolUse": [
     { "matcher": "Bash|bash", "hooks": [{ "type": "command", "command": "lean-ctx hook rewrite" }] }
   ]
   ```

   jq one-liner to do this cleanly (drops any PreToolUse entry whose hook command contains `anti-deletion.sh`; leaves every other entry alone):
   ```bash
   TMP=$(mktemp) && jq '
     .hooks.PreToolUse = [
       .hooks.PreToolUse[]?
       | select(any(.hooks[]?; (.command // "" | tostring) | contains("anti-deletion.sh")) | not)
     ]
   ' ~/.claude/settings.json > "$TMP" && mv "$TMP" ~/.claude/settings.json
   ```

   Back up first if anything feels off: `cp ~/.claude/settings.json ~/.claude/settings.json.bak`.

3. **Delete the state file:** `rm ~/.claude/.yolo-harness-state.json`.

4. **Verify:**
   - `jq . ~/.claude/settings.json` must parse cleanly.
   - `soleri hooks list-packs | grep yolo-safety` — after the manual removal, `list-packs` may still show ✓ because the script is on disk. That's OK. The wiring in `settings.json` is what matters.
   - Start a fresh Claude session to confirm the SessionStart orphan hook is silent (state file gone).

5. **If `remove-pack` was the original failure:** after step 2's manual cleanup, you can safely retry `soleri hooks remove-pack yolo-safety` — it should be idempotent once `settings.json` is valid.

**Keep in mind:** the SessionStart orphan-warning hook from Pre-Activation is permanent and is NOT removed by Harness Restore. Leave it installed — it's your safety net for the next crash.

Do not run new activations until this recovery completes: `defaultMode` restored, state file deleted, `settings.json` parses.

## Anti-Patterns

- Activating YOLO on an unfamiliar codebase — you need vault context first
- Skipping tests in YOLO — tests are safety, not ceremony
- Using YOLO for architectural decisions that need human judgment
- Staying in YOLO after a safety hook triggers — re-evaluate before re-activating
- Running YOLO without reviewing what the safety hook pack actually covers

## Quick Reference

| Op                     | When to Use                          |
| ---------------------- | ------------------------------------ |
| `admin_health`         | Verify safety hook pack is installed |
| `morph`                | Activate/deactivate YOLO mode        |
| `orchestrate_complete` | After every task (never skip)        |
| `search_intelligent`   | Before every decision (never skip)   |
| `plan_reconcile`       | After execution (never skip)         |

**Related skills:** executing-plans, writing-plans

## Completion

After all steps are done, close with a one-line summary:
> "Yolo Mode complete: {brief outcome — e.g. '3 captured, 1 skipped'}"
