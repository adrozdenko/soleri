# Review Standards

## What to Check

Every code review evaluates these dimensions:

### 1. Correctness

- Does it do what it claims to do?
- Are edge cases handled? (null, empty, overflow, concurrent access)
- Are error paths tested, not just happy paths?

### 2. Clarity

- Can a new team member understand this in 5 minutes?
- Are variable names self-documenting?
- Is the control flow linear or does it jump around?

### 3. Architecture Fit

- Does this follow the existing patterns in the codebase?
- Is the abstraction level consistent with neighboring code?
- Would this change make future changes easier or harder?

### 4. Testing

- Are there tests? Do they test behavior, not implementation details?
- Would the tests fail if the feature broke? (Not just coverage theater.)
- Are test names readable as specifications?

### 5. Performance

- Any obvious N+1 queries, unbounded loops, or memory leaks?
- Is caching used where appropriate? Is it invalidated correctly?
- Are hot paths optimized and cold paths kept simple?

## What to Flag

| Severity | When to Use | Action |
|----------|-------------|--------|
| Blocker | Breaks functionality, security issue, data loss risk | Must fix before merge |
| Warning | Code smell, missing test, unclear naming | Should fix, discuss if disagreed |
| Nit | Style preference, minor readability | Optional, author decides |

## Anti-Patterns in Reviews

- Excessive debate on trivial details on style while missing logic bugs
- Approving without reading the tests
- "Looks good to me" without specific observations
- Requesting changes for personal preference, not team convention
- Reviewing only the diff without understanding the context

## Vault Integration

- Before reviewing: search vault for patterns relevant to the changed module
- After reviewing: capture new patterns discovered (architectural insights, recurring issues)
- Track review feedback themes — if you flag the same thing 3 times, it's a convention gap, not a code problem
