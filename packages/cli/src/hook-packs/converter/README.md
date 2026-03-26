# Skill-to-Hook Conversion System

Convert repeatedly-invoked skills into automated Claude Code hooks. Hooks fire automatically on matching events — no manual invocation, no LLM round trip.

## Workflow

```
Score → Convert → Test → Graduate
```

### 1. Score the Candidate

Evaluate 4 dimensions (each HIGH or LOW):

| Dimension             | HIGH when...                                             |
| --------------------- | -------------------------------------------------------- |
| **Frequency**         | 3+ manual calls per session for same event type          |
| **Event Correlation** | Skill consistently triggers on a recognizable hook event |
| **Determinism**       | Skill produces consistent, non-exploratory guidance      |
| **Autonomy**          | Skill requires no interactive user decisions             |

**Threshold:** 3/4 HIGH = candidate for conversion.

```typescript
import { scoreCandidateForConversion } from '@soleri/core';

const result = scoreCandidateForConversion({
  frequency: 'HIGH',
  eventCorrelation: 'HIGH',
  determinism: 'HIGH',
  autonomy: 'LOW',
});
// result.candidate === true (3/4)
```

### 2. Convert

```bash
soleri hooks convert marketing-research \
  --event PreToolUse \
  --matcher "Write|Edit" \
  --pattern "**/marketing/**" \
  --action remind \
  --message "Check brand guidelines and A/B testing data"
```

This creates a hook pack with `manifest.json` and a POSIX shell script.

### 3. Test

```bash
soleri hooks test marketing-research
```

Runs 15 fixtures (5 matching + 10 non-matching) against the hook script. Reports false positives and false negatives. **Zero false positives required before graduation.**

### 4. Graduate

Hooks default to `remind` (gentle context injection). After proving zero false positives:

```bash
soleri hooks promote marketing-research   # remind → warn
soleri hooks promote marketing-research   # warn → block
```

To step back:

```bash
soleri hooks demote marketing-research    # block → warn
```

## Hook Events

| Event          | When it fires                                |
| -------------- | -------------------------------------------- |
| `PreToolUse`   | Before a tool call (Write, Edit, Bash, etc.) |
| `PostToolUse`  | After a tool call completes                  |
| `PreCompact`   | Before context compaction                    |
| `Notification` | On notification events                       |
| `Stop`         | When the session ends                        |

## Action Levels

| Level    | Behavior                              |
| -------- | ------------------------------------- |
| `remind` | Inject context, don't block (default) |
| `warn`   | Inject warning context, don't block   |
| `block`  | Block the operation with a reason     |

## CLI Commands

| Command                           | Description                           |
| --------------------------------- | ------------------------------------- |
| `soleri hooks convert <name>`     | Create a new hook pack from a skill   |
| `soleri hooks test <pack>`        | Validate a hook pack against fixtures |
| `soleri hooks promote <pack>`     | Step up action level                  |
| `soleri hooks demote <pack>`      | Step down action level                |
| `soleri hooks add-pack <pack>`    | Install a hook pack                   |
| `soleri hooks remove-pack <pack>` | Uninstall a hook pack                 |
