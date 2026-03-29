# Code Conventions

## General Rules

- Read the existing code before writing new code. Match the style already there.
- Prefer explicit over implicit. Magic is tech debt in disguise.
- Functions do one thing. If you need "and" to describe it, split it.
- Name things for what they DO, not what they ARE. `fetchUserProfile` beats `userData`.

## File Organization

```
src/
  modules/        # Feature modules, one folder per domain
  shared/         # Cross-cutting utilities, types, constants
  __tests__/      # Test files mirror src/ structure
```

- One export per file for major modules. Barrel files (`index.ts`) for public APIs only.
- Co-locate tests with source: `user.ts` → `user.test.ts` or `__tests__/user.test.ts`
- Keep files under 300 lines. If it's longer, it's doing too much.

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | kebab-case | `user-profile.ts` |
| Functions | camelCase | `getUserProfile()` |
| Classes/Types | PascalCase | `UserProfile` |
| Constants | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| Booleans | is/has/should prefix | `isActive`, `hasPermission` |
| Event handlers | on/handle prefix | `onSubmit`, `handleClick` |

## Error Handling

- Never swallow errors silently. Log or rethrow.
- Use typed errors when the caller needs to distinguish error kinds.
- Fail fast at boundaries (API input, config loading). Be lenient internally.
- Every `try/catch` should handle a specific failure, not wrap 50 lines "just in case."

## Dependencies

- Zero new dependencies unless justified in writing (planning/ RFC).
- Prefer Node.js built-ins over npm packages for standard operations.
- Pin dependency versions. Ranges are surprises waiting to happen.
- Audit dependencies quarterly. Remove what you're not using.

## Git Hygiene

- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`
- One logical change per commit. "Fix bug and add feature" is two commits.
- Branch names: `type/short-description` (e.g., `feat/user-auth`, `fix/login-timeout`)
