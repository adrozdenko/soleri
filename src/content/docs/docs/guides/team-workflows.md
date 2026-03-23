---
title: 'Team Workflows'
description: 'How teams of 2-10 people share, grow, and benefit from a collective knowledge base.'
---

A Soleri agent gets smarter the more you use it. With a team, it gets smarter faster — everyone's discoveries benefit everyone else. This guide covers how to set up and maintain a shared knowledge base across a team.

## The shared vault model

The simplest approach: version-control your agent alongside your code. When you commit your agent's data files (vault database, brain state), every team member who pulls gets the latest knowledge.

```
my-project/
├── src/
├── my-agent/
│   ├── dist/
│   ├── data/
│   │   ├── vault.db          ← shared knowledge
│   │   ├── brain-state.json  ← shared intelligence
│   │   └── plans.json        ← plan history
│   └── package.json
└── .mcp.json
```

When someone captures a pattern, it enters their local vault immediately. When they commit and push, the team gets it on next pull.

### Merge considerations

The vault is a SQLite database — binary files don't merge well with Git. Practical approaches:

- **Single knowledge contributor**: One person (or a rotating role) handles captures. No merge conflicts.
- **Feature branches**: Each person captures on their branch. Merge conflicts are rare because new entries get unique IDs — conflicts only happen if two people edit the same entry.
- **Export/import**: Export vaults as JSON, merge in Git, reimport. JSON merges cleanly.

### Resolving vault merge conflicts

When two branches both modify `vault.db`, Git can't auto-merge the binary file. Here's the step-by-step resolution:

**Step 1** — Before merging, export both vaults to JSON. On your branch, ask the agent to "Export the vault as JSON." Then check out main and export that vault too.

**Step 2** — Merge the JSON files. Git handles JSON diffs well. Resolve any conflicting entries (same ID, different content) by choosing the newer version or combining descriptions.

**Step 3** — Pick one `vault.db` as the base (usually main's), then import the other branch's entries by asking the agent to "Import knowledge from vault-backup-branch.json."

**Step 4** — Run deduplication to catch any overlaps by asking the agent to "Find duplicate entries in the vault."

This is manual, but it happens rarely — only when two people edit the same entry on different branches. New entries (the common case) get unique IDs and don't conflict.

## Who captures what

Not everyone needs to capture everything. Define roles based on your team:

| Role                 | What they capture                                         | Why                                                            |
| -------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| **Tech lead**        | Architecture decisions, anti-patterns from past incidents | These are high-severity patterns that shape the whole codebase |
| **Senior devs**      | Patterns from code reviews, solutions to recurring bugs   | They see the same mistakes across PRs                          |
| **All developers**   | Patterns they discover during work                        | Fresh eyes catch things seniors miss                           |
| **New team members** | Questions that were hard to answer, onboarding gaps       | These become onboarding knowledge for the next hire            |

The goal isn't to capture everything — it's to capture what matters. A vault with 50 well-chosen patterns is more valuable than 500 mediocre ones.

## Onboarding with the agent

New team members benefit immediately from a mature knowledge base:

> **New developer:** "What are the most important patterns for this project?"
>
> **Agent:** _Found 8 critical patterns:_
>
> 1. All API errors must return { error, code, details } format
> 2. Never store JWTs in localStorage — use httpOnly cookies
> 3. Always set K8s resource limits on pods
> 4. Use optimistic updates for form submissions
>    ...

Instead of reading outdated wiki pages or asking busy colleagues, the new developer gets ranked, relevant knowledge immediately. The critical patterns surface first — the ones they absolutely need to know.

## Governance for teams

With multiple people capturing knowledge, governance becomes important:

```bash
npx @soleri/cli governance --preset moderate
```

The moderate preset:

- **Auto-approves** suggestions — low-risk additions go straight to the vault
- **Proposes** warnings and critical entries — someone reviews before they become active
- **Enforces quotas** — prevents any one person from flooding the vault

For stricter teams:

```bash
npx @soleri/cli governance --preset strict
```

Every capture requires proposal review. This works well when knowledge accuracy is critical (security-focused teams, regulated industries).

## Cross-project knowledge sharing

If your team works on multiple repositories, link them:

> **You:** "Link this project to ../api-server as related"
>
> **You:** "Link this project to ../shared-components as parent"

Now when someone on the API team captures a database migration pattern, the frontend team can find it through cross-project search.

Promote team-wide standards to the global pool:

> **You:** "Promote the 'Conventional Commits' pattern to global"

Global patterns surface in every project, every search, for every team member.

## The curator keeps things clean

As the vault grows, the curator maintains quality:

> **You:** "Run a vault health audit"
>
> **Agent:** _Vault health: 87/100_
> _4 potential duplicates found_
> _7 entries unused in 60+ days_
> _2 tags need normalization_

Regular audits prevent knowledge decay. Schedule them monthly — or let the brain's lifecycle run them automatically.

## Measuring knowledge value

Track how your knowledge base is performing:

> **You:** "Show me vault stats"
>
> **Agent:** _142 entries across 5 domains. 98 patterns, 31 anti-patterns, 13 rules. Brain strength: avg 0.72. Top domain: security (38 entries). Most referenced pattern: "Consistent API Error Format" (referenced 23 times)._

High reference counts mean the knowledge is actively useful. Low reference counts on old entries suggest decay candidates.

## Starting small

You don't need to set all this up on day one. A practical rollout:

1. **Week 1**: One person scaffolds the agent, captures 10-15 critical patterns the team already agrees on
2. **Week 2**: Share the agent via version control. Team members start searching and capturing
3. **Week 3**: Set up governance (moderate preset). Link related projects if applicable
4. **Month 2**: Run first vault health audit. Promote proven patterns to global
5. **Ongoing**: Capture becomes habit. The agent gets smarter. Plans get better recommendations.

The compound effect is real — but it takes a few weeks of consistent capture before searches become truly powerful.

See the [Success Story](/docs/guides/dashboard/) for a real example of a team using cross-project knowledge — a new developer onboards in 30 seconds using patterns from a linked project.

---

_Back to [Getting Started](/docs/getting-started/) or explore [Capabilities](/docs/capabilities/) for the full list of operations._
