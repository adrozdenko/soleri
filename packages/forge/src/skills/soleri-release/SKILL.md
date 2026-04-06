---
name: soleri-release
tier: default
description: >
  Use when the user says "release", "bump version", "publish packages",
  "cut a release", "version bump", or "npm publish". Bumps all monorepo
  package versions, commits, tags, and pushes to trigger the Release
  GitHub Actions workflow. For pre-release quality gates, use deliver-and-ship instead.
---

# Release — Version Bump & Publish

Bump all monorepo package versions in lockstep, commit, tag, and push to trigger the CI/CD release pipeline. This skill handles the mechanical release process — it does NOT run quality gates (use `deliver-and-ship` for that).

## When to Use

- After a feature or fix has landed on main and is ready to publish
- When the user explicitly asks to bump, release, or publish
- NOT for pre-release checks — that is `deliver-and-ship`

## When NOT to Use

- Mid-development — features should be merged first
- Before tests pass — run `deliver-and-ship` first if unsure
- For individual package releases — this bumps ALL packages in lockstep

## Workflow

### Step 1: Vault Check

Search the vault for release-related anti-patterns before proceeding. Known issues (like npm publish skip patterns swallowing auth errors) should inform the release.

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "release publish npm version bump anti-pattern", mode: "scan", limit: 5 }
```

### Step 2: Determine Current Version

Read the root `package.json` to get the current version. Verify all packages are in sync.

```bash
grep '"version"' package.json packages/*/package.json
```

If any package version is out of sync, stop and flag it to the user before proceeding.

### Step 3: Determine Bump Type

Ask the user if not specified. Follow semver:

| Type | When | Example |
|------|------|---------|
| `patch` | Bug fixes, minor improvements, non-breaking changes | `9.18.2` → `9.18.3` |
| `minor` | New features, backward-compatible additions | `9.18.2` → `9.19.0` |
| `major` | Breaking changes | `9.18.2` → `10.0.0` |

Default to **patch** if the user just says "bump" or "release" without specifying.

### Step 4: Check Preconditions

Before bumping, verify:

1. **Clean working tree** — no uncommitted changes. If dirty, stop and ask the user.
2. **On main branch** — releases ship from main. If on a feature branch, warn the user.
3. **Up to date with remote** — run `git fetch origin main` and compare. If behind, warn.
4. **Tag does not already exist** — check `git tag -l "vX.Y.Z"`. If it exists, stop.

### Step 5: Bump All Package Versions

Update every `package.json` in the monorepo to the new version:

```bash
for f in package.json packages/*/package.json; do
  sed -i '' "s/\"version\": \"OLD\"/\"version\": \"NEW\"/" "$f"
done
```

Verify the bump succeeded by grepping all package.json files for the new version. Every package must show the new version — if any are mismatched, fix before continuing.

### Step 6: Commit

Create a conventional commit with the version bump:

```bash
git add package.json packages/*/package.json
git commit -m "chore: bump version to X.Y.Z"
```

Do NOT include AI attribution in the commit message.

### Step 7: Tag

Create an annotated tag matching the release workflow trigger pattern:

```bash
git tag vX.Y.Z
```

### Step 8: Push

Push the commit and tag together. This triggers the Release GitHub Actions workflow.

```bash
git push origin main --follow-tags
```

If the tag did not push with `--follow-tags`, push it explicitly:

```bash
git push origin vX.Y.Z
```

### Step 9: Verify Pipeline

Check that the Release workflow started:

```bash
gh run list --limit 3
```

Report the workflow run status to the user. If it failed to trigger, check:
- Was the tag pushed? (`git ls-remote --tags origin | grep vX.Y.Z`)
- Does the workflow trigger on `v*` tags? (check `.github/workflows/release.yml`)

### Step 10: Capture Knowledge (if anything unusual happened)

Only capture if something unexpected occurred during the release — a new gotcha, a process change, or a failure mode worth remembering.

```
YOUR_AGENT_core op:capture_knowledge
  params: {
    title: "<what was learned>",
    description: "<details>",
    type: "anti-pattern",
    domain: "tooling",
    tags: ["release", "npm", "publish"]
  }
```

Do NOT capture routine successful releases — that is noise.

## Release Workflow Reference

The Release GitHub Actions workflow (`.github/workflows/release.yml`) runs on `v*` tag pushes and executes:

1. **build-and-test** — Install, build all packages, run unit tests
2. **e2e** — Run end-to-end tests (gated on build-and-test)
3. **publish** — Publish each package to npm with skip-if-exists logic (gated on e2e)
4. **changelog** — Generate changelog from conventional commits between tags
5. **github-release** — Create a GitHub Release with the changelog

Each publish step handles "already published" gracefully — if a version already exists on npm, it skips without failing.

## Common Mistakes

- **Bumping without checking git status** — dirty working tree means the commit will include unintended changes
- **Forgetting to push the tag** — `--follow-tags` only pushes annotated tags that are reachable; if it does not push, use explicit `git push origin vX.Y.Z`
- **Bumping on a feature branch** — releases should come from main
- **Not verifying version sync** — if one package is ahead or behind, the release is inconsistent

## Agent Tools Reference

| Op | When to Use |
|----|-------------|
| `search_intelligent` | Check vault for release anti-patterns before starting |
| `capture_knowledge` | Persist new release gotchas (only when something unusual happens) |
