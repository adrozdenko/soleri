# Component Build — Design-Aware Development

## When to Use

When building a new UI component with design system compliance.

## Steps

### 1. Define Component API

- Define props, events, slots
- Search vault for existing component patterns: `op:search_intelligent`
- Check for similar components to avoid duplication

### 2. Write Storybook Story (RED)

- Create story covering all visual states
- Include: default, hover, focus, disabled, error, loading
- Story should fail because component doesn't exist yet

### 3. Implement Component (GREEN)

- Token-validated: no hardcoded colors, use semantic tokens
- Validate with: `op:validate_component_code`
- Check contrast: `op:check_contrast`

### 4. Add Behavior Tests

- Keyboard navigation (Tab, Enter, Space, Escape, Arrows)
- ARIA attributes and roles
- Edge cases (empty, overflow, max values)

### 5. Verify Accessibility

- Contrast check on all color pairs
- Focus ring visible on keyboard navigation
- Touch targets minimum 44px
- Screen reader announcement

### 6. Refactor & Polish

- Extract reusable patterns
- Ensure all tests pass
- Capture patterns to vault: `op:capture_knowledge`
