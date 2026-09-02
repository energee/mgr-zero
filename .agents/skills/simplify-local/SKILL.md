---
name: simplify-local
description: Simplifies recently modified code for clarity, consistency, and maintainability while preserving behavior. Use after implementing or refactoring code, or when the user asks to simplify, clean up, reduce complexity, or perform a final code-quality pass.
---

# Simplify

Improve the relevant code without changing its observable behavior.

## Scope

1. Read `AGENTS.md` and every project guide it routes to for the affected files.
2. If the user supplied files or scope, use it.
3. Otherwise inspect `git status --short`, `git diff`, and untracked files, then limit work to code modified for the current task.
4. Do not clean up unrelated pre-existing code.

## Simplification standard

Prefer code that is explicit, readable, and easy to debug. Look for:

- unnecessary nesting, indirection, duplication, or temporary state
- abstractions used only once that obscure rather than clarify
- overly broad functions that can be clarified without redesigning the feature
- dense expressions, nested ternaries, and clever one-liners
- redundant comments that merely restate the code
- inconsistent names or patterns within the touched area
- dead code introduced or exposed by the current change

Preserve useful boundaries, domain terminology, validation, error handling,
security checks, and comments that explain why. Fewer lines are not inherently
simpler.

## Constraints

- Preserve APIs, behavior, outputs, side effects, and error semantics.
- Follow the existing project architecture instead of introducing a competing pattern.
- Do not change schemas, dependencies, generated files, or product behavior merely to simplify code.
- Do not hand-edit generated or tool-owned files.
- Keep the diff focused; revert a proposed simplification if equivalence is uncertain.
- Ask before proceeding if simplification would require a design or behavior decision.

## Workflow

1. Establish the exact changed-code scope.
2. Read enough surrounding code and tests to understand behavior and invariants.
3. Identify concrete simplifications; do not make stylistic churn.
4. Apply the smallest coherent edits.
5. Review the resulting diff specifically for accidental behavior changes.
6. Run the repository-required tests, typecheck, and lint for the affected code.
7. Summarize meaningful simplifications and verification. If no worthwhile simplification exists, say so and leave the code unchanged.
