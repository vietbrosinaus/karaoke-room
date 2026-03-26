---
name: babysit-pr
description: >
  Monitor and auto-fix a GitHub PR in one pass. Use when the user says "babysit PR",
  "babysit-pr", "watch this PR", "fix PR comments", or wants to check a PR for CI
  failures and review comments then fix them. Takes a PR number as argument
  (e.g., /babysit-pr 1012). Pair with /loop for continuous monitoring
  (e.g., /loop 10m /babysit-pr 1012).
---

# Babysit PR

One-pass PR health check: fix CI failures, address review comments, push, re-request review.

## Input

Parse PR number from args. If missing, run `gh pr list --state open` and ask.

## Step 1: Check CI

```bash
gh pr checks <PR>
```

If any check **fails**: get logs with `gh run view <RUN_ID> --log-failed`, fix the code, verify locally.

## Step 2: Check review comments

```bash
gh api graphql -f query='{ repository(owner: "{owner}", name: "{repo}") {
  pullRequest(number: <PR>) { reviewThreads(first: 50) { nodes {
    id isResolved comments(first: 1) { nodes { body path line author { login } } }
  } } }
} }' --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'
```

For each unresolved thread:
1. Read the file, understand the issue, fix the code
2. Reply: `gh api repos/{owner}/{repo}/pulls/<PR>/comments/<ID>/replies -f body="<explanation>"`
3. Resolve: `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<ID>"}) { thread { isResolved } } }'`

## Step 3: Check for uncommitted files

Run `git status` to check for any leftover modified/untracked files that should have been committed. This catches formatting changes from `pnpm format`, files left behind from earlier fixes, or any other uncommitted work.

If there are uncommitted changes:
1. Review each file's diff to understand what changed
2. If they are relevant to the PR (formatting fixes, lint fixes, etc.), stage, commit, and push them
3. If they are unrelated, flag them to the user

## Step 4: Push and re-request (only if fixes were made)

1. Verify: `pnpm lint && pnpm format:check && npx tsc --noEmit` (auto-fix with `pnpm format` if needed)
2. Stage specific files, commit, push
3. **ALWAYS re-request Copilot review** after pushing fixes:

   ```bash
   gh api repos/{owner}/{repo}/pulls/<PR>/requested_reviewers --method POST -f 'reviewers[]=copilot-pull-request-reviewer[bot]'
   ```

   The key is the `[bot]` suffix — `copilot-pull-request-reviewer` alone returns 422, but `copilot-pull-request-reviewer[bot]` works. The bot's username is `Copilot` (ID: 175728472).

## Step 5: Report

If fixes made: summarize changes AND confirm Copilot review was re-requested. If clean: "All checks passing, no unresolved comments, no uncommitted files."
