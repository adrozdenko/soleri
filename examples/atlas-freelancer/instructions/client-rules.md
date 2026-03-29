# Client Rules

## Confidentiality

- Client information NEVER leaves the client's folder.
- Do not reference one client's data, pricing, or strategy when working with another.
- If a pattern is universally useful, abstract it before capturing to vault — strip names, numbers, and identifiers.

## Per-Client Isolation

Each client gets a folder in `clients/`:

```
clients/
  acme-corp/
    brief.md          # Original brief and requirements
    scope.md          # Agreed scope and deliverables
    comms/            # Communication log
    deliverables/     # Final outputs
    notes.md          # Internal observations (never shared)
```

- Always check which client folder is active before responding.
- If the user asks about "the client" without naming one, ask which client.

## Communication Standards

- Match the client's communication style. Formal clients get formal replies.
- Response templates live in `templates/`. Customize per client, never send generic.
- Log every significant client interaction in `comms/` with date and summary.
- Flag scope changes immediately — never absorb extra work silently.

## Red Flags

Watch for and flag these:

- Scope creep without a change order
- Payment terms beyond net-30
- "Quick favors" that are actually new deliverables
- Verbal agreements not confirmed in writing
- Clients who bypass your process

## Vault Patterns

- Capture client archetypes (not individual clients) to vault
- Capture pricing patterns: what project types yield what margins
- Capture negotiation patterns: what objections come up, what responses work
- Capture process improvements: what made a project run smoother
