# Accessibility Remediation

## When to Use

When fixing accessibility issues, WCAG violations, or improving keyboard/screen reader support.

## Steps

### 1. Audit Current State

- Run accessibility audit (axe/lighthouse)
- Search vault for similar past fixes: `op:search_intelligent`
- Categorize issues by severity (critical, major, minor)

### 2. Fix Contrast Issues

- Use token-first approach — never hardcode colors
- Validate each pair: `op:check_contrast`
- Get accessible alternatives: `op:get_color_pairs`

### 3. Fix ARIA Issues

- Correct roles, attributes, live regions
- Prefer semantic HTML over ARIA when possible

### 4. Fix Keyboard Issues

- Tab order (logical, not DOM order)
- Enter/Space activation, Escape dismissal
- Arrow key navigation for composite widgets

### 5. Fix Focus Management

- Focus visible on all interactive elements
- Focus trapped in modals/dialogs
- Focus restored after modal close

### 6. Verify All Fixes

- Run full audit — zero critical/major issues
- Capture anti-patterns to vault: `op:capture_knowledge`
