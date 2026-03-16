# Feature Development

## When to Use
When building a new feature, adding functionality, or creating components.

## Steps

### 1. Understand
- Search vault for existing patterns: `op:search_intelligent`
- Read relevant source code
- Clarify requirements with user if ambiguous

### 2. Plan
- Create structured plan: `op:orchestrate_plan`
- Present plan to user, wait for approval
- Do NOT write code before approval

### 3. Test First
- Write failing tests that define the expected behavior
- Run tests to confirm they fail (RED)

### 4. Implement
- Write minimum code to pass tests (GREEN)
- Follow vault patterns, avoid known anti-patterns
- Use semantic tokens, not hardcoded values

### 5. Refactor
- Clean up without changing behavior
- Extract reusable patterns
- Ensure all tests still pass

### 6. Capture & Ship
- Capture learned patterns: `op:capture_knowledge`
- Link new entries to related knowledge: `op:link_entries`
- Complete orchestration: `op:orchestrate_complete`
