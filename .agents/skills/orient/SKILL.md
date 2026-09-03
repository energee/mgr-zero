---
name: orient
description: Session orientation. Run first, before any other action in a session — before reading code, asking questions, or planning. Reports the worktree, branch, tree state, and PR base, then stops for confirmation so work never lands on the wrong checkout.
allowed-tools: Bash(pwd), Bash(git worktree list), Bash(git branch:*), Bash(git status:*), Bash(gh pr view:*)
---

# orient

Before doing anything else, run:

```sh
pwd
git worktree list
git branch --show-current
git status --short
gh pr view --json number,baseRefName,headRefName 2>/dev/null
```

Report all of it verbatim. Confirm this is the intended target for the work
about to be described, and confirm the PR base is `main` unless told otherwise.
Then wait for the user.

Do not skip this because the task looks small; wrong-checkout starts have cost
multi-hour tangents here (see `.agents/MEMORY.md`).
