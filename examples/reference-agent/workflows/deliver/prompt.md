# Deliver Feature

## When to Use

When shipping a feature, cutting a release, deploying to an environment, or publishing a package.

## Steps

### 1. Pre-Flight Check

- Search vault for known delivery anti-patterns: `op:search_intelligent`
- Verify all acceptance criteria are met
- Confirm test suite is passing: `npm test`

### 2. Validate Code Quality

- Run lint and type checks
- Validate component code if applicable: `op:validate_component_code`
- No open TODOs or debug statements in changed files

### 3. Verify Test Coverage

- Check test coverage meets the threshold (≥80%)
- Confirm regression tests exist for any bugs fixed in this delivery

### 4. Capture & Ship

- Capture any delivery patterns or lessons: `op:capture_knowledge`
- Complete orchestration: `op:orchestrate_complete`
- Tag release if applicable
