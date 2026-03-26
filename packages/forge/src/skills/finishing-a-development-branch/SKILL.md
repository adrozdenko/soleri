---
name: finishing-a-development-branch
description: >
  Use when the user says "finish branch", "merge branch", "ready to merge", "PR ready",
  "close branch", "submit PR", or wants to finalize a development branch for merge into
  the base branch.
---

# Finishing a Development Branch

Pre-merge checks, PR creation, merge strategy, and branch cleanup.

**Announce at start:** "I'm using the finishing-a-development-branch skill to prepare this branch for merge."

## Step 1: Pre-Merge Checklist

Run all checks before creating a PR. Stop on any failure.

```bash
npm test              # all tests pass
npx tsc --noEmit      # typecheck clean
npm run lint          # no lint errors (if configured)
```

Verify no uncommitted changes: `git status` should be clean. Commit or stash before proceeding.

## Step 2: Create the Pull Request

1. Push the branch: `git push -u origin <branch>`
2. Create PR with `gh pr create`:
   - **Title**: under 70 chars, conventional format (`feat:`, `fix:`, `refactor:`)
   - **Body**: summary (what + why), test plan, breaking changes if any
   - **Reviewers**: add if the user specifies or the repo has CODEOWNERS
   - **Labels/milestone**: add if relevant

Keep the description focused on _why_ the change exists, not a file-by-file diff recap.

## Step 3: Squash vs Merge Commit

| Signal                           | Strategy         | Rationale                         |
| -------------------------------- | ---------------- | --------------------------------- |
| Many WIP/fixup commits           | **Squash**       | Clean history, one logical change |
| Each commit is a meaningful unit | **Merge commit** | Preserves granular history        |
| Single commit on branch          | Either           | No difference                     |
| Team convention exists           | **Follow it**    | Consistency wins                  |

Default to **squash** unless the user or repo convention says otherwise.

## Step 4: Handle Merge Conflicts

If the base branch has diverged:

1. `git fetch origin && git rebase origin/<base>` — preferred, keeps history linear
2. Resolve conflicts file by file, run the full checklist (Step 1) again after resolving
3. `git rebase --continue` after each resolution
4. If rebase is too complex, `git merge origin/<base>` is acceptable — ask the user

Never force-push a rebased branch that others are working on.

## Step 5: Branch Cleanup

After merge is confirmed:

1. `git checkout <base> && git pull`
2. `git branch -d <branch>` — delete local branch
3. If remote branch not auto-deleted: `git push origin --delete <branch>`

## Anti-Patterns

- **Force-pushing to shared branches** — destroys others' history; only force-push personal branches
- **Merging without tests passing** — broken main is worse than a delayed merge
- **Giant PRs** — split if touching 10+ files across unrelated concerns
- **Empty PR descriptions** — reviewers need context; "fixes stuff" is not a description
- **Leaving stale branches** — delete after merge; stale branches create confusion

**Related skills:** executing-plans, verification-before-completion
