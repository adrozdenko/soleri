# Code Review — Design System Aware

## When to Use

When reviewing code for design system compliance, accessibility, and quality.

## Steps

### 1. Context

- Search vault for relevant patterns: `op:search_intelligent`
- Understand the intent of the changes
- Check design system rules: `op:get_clean_code_rules`

### 2. Design System Check

- Validate token usage: `op:validate_component_code`
- Check contrast ratios: `op:check_contrast`
- Verify component patterns: `op:get_component_workflow`

### 3. Code Quality Review

- Check for correctness, readability, maintainability
- Verify test coverage
- Check for security issues

### 4. Accessibility Review

- WCAG compliance
- Keyboard navigation
- Screen reader support
- Focus management

### 5. Feedback

- Provide actionable, specific feedback
- Reference vault patterns where applicable
- Distinguish blocking issues from suggestions

### 6. Capture

- If review reveals new patterns or anti-patterns, capture them: `op:capture_knowledge`
