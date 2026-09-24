---
description: Simplify recently modified code without changing behavior
argument-hint: "[files or scope]"
---

Simplify the code modified for the current task without changing its observable
behavior. Read `AGENTS.md` first. Scope: ${ARGUMENTS:-git diff + untracked files
from the current task}; leave unrelated pre-existing code alone.

Remove unnecessary nesting, indirection, single-use abstractions, dense one-liners,
redundant comments, and dead code the change exposed. If new code duplicates an
existing helper, component, or query, use the existing one (AGENTS.md
"Don't reinvent"). Run the Haiku check (AGENTS.md "Don't write code Haiku
can't explain") and simplify whatever fails it. Preserve APIs, behavior,
error semantics, security checks, domain terms, and comments that explain why.
Do not touch schemas, dependencies, or generated files. Ask before any change
that needs a design or behavior decision. Then run
`bun run test && bunx tsc --noEmit && bun run lint`.
