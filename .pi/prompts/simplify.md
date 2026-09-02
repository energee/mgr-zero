---
description: Simplify recently modified code without changing behavior
argument-hint: "[files or scope]"
---

Simplify the code modified for the current task without changing its observable
behavior. Read `AGENTS.md` first. Scope: ${ARGUMENTS:-git diff + untracked files
from the current task}; leave unrelated pre-existing code alone.

Remove unnecessary nesting, indirection, single-use abstractions, dense one-liners,
redundant comments, and dead code the change exposed. Preserve APIs, behavior,
error semantics, security checks, domain terms, and comments that explain why.
Do not touch schemas, dependencies, or generated files. Ask before any change
that needs a design or behavior decision. Then run
`npx vitest run && npx tsc --noEmit && npm run lint`.
