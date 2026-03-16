# Token Migration

## When to Use
When migrating from hardcoded colors to semantic design tokens, or upgrading token systems.

## Steps

### 1. Plan Migration
- Audit all hardcoded values in scope
- Map each value to semantic token equivalent
- Create migration plan: `op:orchestrate_plan`

### 2. Search & Replace
- Replace hardcoded values with tokens
- Priority: semantic > contextual > primitive
- Validate each replacement: `op:validate_token`

### 3. Verify
- Run full code validation: `op:validate_component_code`
- Check contrast on all migrated color pairs
- Ensure zero visual regressions

### 4. Capture
- Log migration patterns to vault
- Note any anti-patterns discovered
- Complete orchestration: `op:orchestrate_complete`
