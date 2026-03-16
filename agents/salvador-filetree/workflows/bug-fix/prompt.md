# Bug Fix

## When to Use
When fixing bugs, resolving errors, or addressing regressions.

## Steps

### 1. Reproduce
- Understand the reported issue
- Search vault for similar past bugs: `op:search_intelligent`
- Identify the root cause, not just the symptom

### 2. Plan Fix
- Create a plan: `op:orchestrate_plan`
- Identify affected files and potential side effects
- Wait for user approval

### 3. Write Regression Test
- Write a test that reproduces the bug (RED)
- Confirm it fails for the right reason

### 4. Fix
- Apply the minimal fix
- Run the regression test — must pass (GREEN)
- Run full test suite — no new failures

### 5. Capture
- If the bug reveals a pattern or anti-pattern, capture it: `op:capture_knowledge`
- Complete orchestration: `op:orchestrate_complete`
