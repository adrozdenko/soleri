# Design System Rules

## Token Priority

1. Semantic first — `text-warning`, `bg-error`
2. Contextual second — `text-primary`, `bg-surface`
3. Primitive last — only when no semantic fit

## Forbidden

- NO raw colors: `#hex`, `rgb()`, `hsl()`, `bg-blue-500`
- NO `!important` in CSS
- NO inline styles — use Tailwind classes

## Validation

- Validate code with: `op:validate_component_code`
- Check contrast with: `op:check_contrast`
- Get accessible color pairs with: `op:get_color_pairs`

## Accessibility

- WCAG AA minimum for all text (4.5:1 normal, 3:1 large)
- Focus rings on all interactive elements (44px touch targets)
- Semantic HTML over ARIA when possible
- Keyboard navigation for every interactive element
