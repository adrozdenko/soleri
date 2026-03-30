---
title: 'Knowledge Review Workflow'
description: 'Submit vault entries for team review, approve or reject them, and track review progress.'
---

When multiple people contribute to a vault, not every entry should go live immediately. The knowledge review workflow adds a quality gate: entries are submitted for review, a reviewer approves or rejects them, and only approved entries are treated as trusted knowledge.

## How review status works

Every vault entry has a review status that moves through a simple lifecycle:

```
draft → pending_review → approved
                       → rejected
```

By default, entries captured directly go straight into the vault without review. The review workflow is for entries that need a second pair of eyes — team conventions, architectural decisions, security patterns.

## Submitting an entry for review

After capturing an entry, submit it for review:

> **You:** "Submit the 'Database Sharding Strategy' entry for review"
>
> **Agent:** _Submitted for review: "Database Sharding Strategy" — status changed to pending_review._

You can include your name so reviewers know who submitted it:

> **You:** "Submit entry abc-123 for review, submitter: Alex"
>
> **Agent:** _Submitted by Alex. Pending review._

## Reviewing pending entries

See what's waiting for review:

> **You:** "Show pending reviews"
>
> **Agent:** _3 entries pending review:_
>
> 1. **Database Sharding Strategy** — submitted by Alex, 2 hours ago
> 2. **API Versioning Convention** — submitted by Jordan, 1 day ago
> 3. **Feature Flag Naming Standard** — submitted by Sam, 3 days ago

## Approving an entry

When you've reviewed an entry and it looks good:

> **You:** "Approve the 'Database Sharding Strategy' entry"
>
> **Agent:** _Approved: "Database Sharding Strategy" — status changed to approved._

Add a comment to explain your review decision:

> **You:** "Approve entry abc-123, reviewer: Pat, comment: 'Solid approach, aligns with our horizontal scaling plan'"
>
> **Agent:** _Approved by Pat with comment._

## Rejecting an entry

If an entry isn't ready or doesn't meet the team's standards:

> **You:** "Reject the 'API Versioning Convention' entry, comment: 'Needs to address breaking change policy before we adopt this'"
>
> **Agent:** _Rejected: "API Versioning Convention" — reason: Needs to address breaking change policy before we adopt this._

Rejected entries stay in the vault — they're not deleted. The submitter can revise the entry and resubmit.

## Checking review stats

See the overall state of your review pipeline:

> **You:** "Show review stats"
>
> **Agent:** _Review statistics:_
> - Pending: 2
> - Approved: 47
> - Rejected: 5

## Who should review what

Review is most valuable for:

- **Team conventions** — coding standards, naming rules, commit formats that everyone must follow
- **Architectural decisions** — choices that affect the whole system and are hard to reverse
- **Security patterns** — anything marked critical that could cause real damage if wrong
- **Anti-patterns** — patterns you want the whole team to avoid

For personal patterns, quick captures, and exploratory knowledge, skip the review — capture directly and refine later.

## Access control

Submitting an entry for review requires write access. Approving or rejecting requires admin access. This separation ensures that anyone can propose knowledge, but only designated reviewers can promote it to approved status.

## Related guides

- [Content Ingestion](/docs/guides/content-ingestion/) — bulk-ingested entries are good candidates for review
- [Entry Linking & Knowledge Graph](/docs/guides/entry-linking/) — link approved entries into the knowledge graph
- [Team Workflows](/docs/guides/team-workflows/) — how review fits into team knowledge sharing
- [Vault Branching](/docs/guides/vault-branching/) — stage reviewed changes on a branch before merging
- [Capabilities](/docs/capabilities/) — full list of review operations
- [API Reference](/docs/api-reference/) — parameter details for `vault_submit_review`, `vault_approve`, `vault_reject`

---

_Previous: [Content Ingestion](/docs/guides/content-ingestion/) — feed documents into your vault. Next: [Sync & Export](/docs/guides/vault-sync/) — back up your vault to git or use it in Obsidian._
