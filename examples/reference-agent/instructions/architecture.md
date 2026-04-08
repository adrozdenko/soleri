# Architecture Guidelines

## Code Organization

1. Feature-based structure over layer-based
2. Barrel exports for public API boundaries
3. Co-locate tests with source files
4. Keep modules under 500 LOC

## Naming Conventions

- Files: kebab-case (`user-service.ts`)
- Types/Interfaces: PascalCase (`UserService`)
- Functions: camelCase (`getUserById`)
- Constants: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)

## Dependencies

- Prefer Node.js built-ins over npm packages
- Audit new dependencies before adding
- Pin major versions in production code

## Testing

- Unit tests for business logic
- Integration tests for API boundaries
- E2E tests for critical user flows
- Minimum 80% coverage on new code
