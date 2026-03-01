---
id: architecture-open-source-opensource-agent-forge
title: Open Source Release — Agent Forge (Local CLI)
category: open-source
severity: critical
tags:
  - open-source
  - agent-forge
  - cli
  - local
  - registry
  - teams
knowledge_type: architecture
status: active
created: 2026-02-24
updated: 2026-02-24
curator_version: 2
confidence: 1
source: unknown
---

# Open Source Release — Agent Forge (Local CLI)

## Context

Forge creates a live parent-child link between templates and generated agents. Updates propagate via template versioning + three-way merge (base template, user customizations, new template). Updates NEVER touch the vault — that's the user's knowledge, sacred. Only persona config, CLAUDE.md injection, and domain wiring are forge-managed and updatable.

## Pattern

Agent Forge is a LOCAL CLI tool, not a hosted service. It runs entirely on the user's machine.

### Core Commands

```bash
soleri forge <name>       # Create a new agent from template
soleri update             # Update all agents to latest templates
soleri list               # Show all registered agents + versions
soleri doctor             # Check system health + compatibility
soleri vault connect <uri> # Connect to a shared/team vault
```

### Forge Registry

The forge maintains a local registry tracking every agent it created:

```yaml
# ~/.config/soleri/forge-registry.yaml
engine_version: 2.1.0
agents:
  salvador:
    created: 2026-01-15
    template: design-assistant
    template_version: 1.3.0
    domains: [design, component]
    path: ~/.config/soleri/personas/salvador/
    vault_backends:
      - type: local
        path: ~/.config/soleri/personas/salvador/vault/
      - type: git
        uri: git@github.com:team/shared-vault.git
        role: member

  gaudi:
    created: 2026-02-01
    template: architecture-assistant
    template_version: 1.3.0
    domains: [architecture, database, security]
    path: ~/.config/soleri/personas/gaudi/
    vault_backends:
      - type: local
        path: ~/.config/soleri/personas/gaudi/vault/

shared_vault:
  type: local
  path: ~/.config/soleri/shared-vault/
```

### Team Support in Forge

Forge supports team vault connections per-persona:

```bash
# Connect a persona to a team's shared vault
soleri vault connect git://github.com/team/design-patterns --persona salvador

# Connect project-level shared vault
soleri vault connect git://github.com/team/project-vault

# Promote a pattern from personal to team vault
soleri vault promote <pattern-id> --target team
```

The forge registry tracks vault backends per persona. A persona can read from multiple vaults (personal + team + project) with clear priority: personal > project-shared > team-shared.

### Update Mechanism

When you release a template update:

```bash
soleri update

# Forge checks registry:
#   salvador: template 1.2.0 → 1.3.0 available
#   gaudi:    template 1.2.0 → 1.3.0 available
#
# Forge computes diff between template v1.2 and v1.3
# Applies diff to user's current files via three-way merge
# Conflicts? Shows diff, asks user to resolve
# Vault/ NEVER touched
# Updates registry version
```

## Example

```bash
# First time setup
npm install -g soleri
soleri forge salvador --domain design
# Creates persona, registers in registry, adds MCP config (if needed)
# Ships with free starter knowledge pack for design domain
# First activation scans project and captures initial patterns

# Team setup
soleri vault connect git://github.com/acme/design-vault --persona salvador
# Salvador now searches: personal vault → project shared vault → team vault

# Updates
soleri update
# Patches all personas to latest template. Vault untouched.

soleri doctor
# Shows engine version, vault format, domain compatibility, persona status
```

## Why

No servers to run, no user data to manage, no infrastructure costs. Publish packages to npm, users pull updates. Same model as git, brew, create-react-app but with an update propagation mechanism. Team vault support is additive — a forge config change, not an architecture change — because the vault backend abstraction was designed in from the start.
