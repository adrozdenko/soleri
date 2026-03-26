# Marketing Research Hook Pack

Example hook demonstrating the skill-to-hook conversion workflow. Automatically reminds you to check brand guidelines and A/B testing data when editing marketing files.

## Conversion Score

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Frequency | HIGH | 4+ manual checks per session when editing marketing content |
| Event Correlation | HIGH | Always triggers on Write/Edit to marketing files |
| Determinism | HIGH | Lookups and context injection, not creative guidance |
| Autonomy | HIGH | No interactive decisions needed |

**Score: 4/4 — Strong candidate**

## Install

```bash
soleri hooks add-pack marketing-research
```

## What It Does

Fires on `Write` and `Edit` tool calls when the target file matches marketing patterns:
- `**/marketing/**`
- `**/*marketing*`
- `**/campaign*/**`

Injects a reminder with brand guidelines context. Does not block — action level is `remind`.

## Graduation

```bash
soleri hooks promote marketing-research   # remind → warn
soleri hooks promote marketing-research   # warn → block
```
