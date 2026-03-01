---
id: pattern-open-source-opensource-soleri-availability
title: Open Source Release — Soleri Availability Audit
category: open-source
severity: critical
tags:
  - open-source
  - naming
  - soleri
  - availability
  - npm
  - github
knowledge_type: pattern
status: archived
created: 2026-02-24
curator_version: 1
confidence: 1
source: unknown
---

# Open Source Release — Soleri Availability Audit

## Context

Closest confusable: 'Solera' (vehicle claims software by Solera Inc) — different enough, different space entirely. Legacy uses: two defunct French IT firms (Soleri-Cigel closed 1998, Soleri consulting radiated Aug 2025). One Florida LLC (Soleri LLC, formed Aug 2025, no visible product). soleri.co is a parked/placeholder page. None of these are in developer tools or AI.

## Pattern

Full availability check for Soleri as of 2026-02-24. npm 'soleri': AVAILABLE. npm @soleri/core, @soleri/cli, @soleri/engine, @soleri/forge: ALL AVAILABLE. GitHub 'soleri': user exists with 0 public repos (dead account). GitHub 'soleri-ai': likely available. USPTO trademark: no filing found for 'SOLERI' in software classes (IC 9/42). No active tech companies, no AI products, no dev tools using this name.

## Example

```typescript
Recommended namespace strategy: npm package 'soleri' (unscoped, grab immediately). Scoped packages @soleri/* for sub-packages. GitHub org 'soleri-ai' (since github.com/soleri user account exists but is inactive). Domains to check/register: soleri.dev, soleri.ai, soleri.sh, soleri.io.
```

## Why

GREEN rating across all critical checks. This is the cleanest name found after 40+ candidates. Securing npm package name and GitHub org should be done immediately to prevent squatting.


