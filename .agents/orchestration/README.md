# MGR multi-agent workflow

A project-local, harness-neutral orchestrator for budgeting Grok, Codex, and
Claude according to their strengths. Any coding harness can invoke the same CLI
through its shell tool; the initiating harness does not own the workflow state.

## Safety model

- Codex is the only write-enabled model.
- Grok and Claude run in read-only/plan permission modes.
- Complex and high-risk tasks require a separate human-approved implementation command.
- Review and fix rounds are bounded by each tier's `maxAgentRuns` budget.
- Recursive orchestration is blocked with `MULTI_AGENT_ACTIVE`.
- A new run requires a clean working tree so reviews cannot mix unrelated edits.
- The workflow never commits.

CLI calls use each tool's existing local authentication and consume that
provider's subscription allowance or API billing, as configured in that tool.

## Commands

From the repository root:

```bash
.agents/orchestration/bin/workflow doctor
.agents/orchestration/bin/workflow run --tier standard "Fix the order total bug"
.agents/orchestration/bin/workflow plan --tier complex "Add order cancellation"
.agents/orchestration/bin/workflow status
```

A complex plan stops and prints a run ID. Inspect its artifacts before continuing:

```bash
.agents/orchestration/bin/workflow implement --approve <run-id>
.agents/orchestration/bin/workflow review <run-id>
# Inspect review.json and approve only findings that should be applied.
.agents/orchestration/bin/workflow fix --approve <run-id>
```

`run` completes standard tasks directly. For complex and
high-risk tasks it intentionally behaves like `plan` and stops at the approval
gate.

## Routing and budgets

| Tier | Route | Maximum agent runs |
| --- | --- | ---: |
| `standard` | Codex implement | 1 |
| `complex` | Grok plan → Codex implement → Grok review → Codex fix | 4 |
| `high-risk` | Grok plan → Claude plan review → Codex implement → Claude review → Codex fix | 5 |

The source of truth is `policy.json`. Prompts and structured-output schemas live
beside it. Generated state, raw model output, status, and diffs are written to
`runs/<run-id>/` and ignored by Git.

## Harness usage

Claude Code, Codex, and Grok can all execute the same command. A caller
should invoke the command once, display its JSON result, and stop at approval
gates. It must not recreate routing logic or invoke provider CLIs directly.

## Configuration

No additional package is required. Override a CLI executable for testing or a
nonstandard installation with:

```bash
AGENT_WORKFLOW_GROK_BIN=/path/to/grok
AGENT_WORKFLOW_CODEX_BIN=/path/to/codex
AGENT_WORKFLOW_CLAUDE_BIN=/path/to/claude
```

Timeouts, tier routes, and run caps are configured in `policy.json`.

## Verification

```bash
npx vitest run .agents/orchestration/tests/workflow.test.mjs
```

Vitest ignores dot-directories during its default scan, so keep this explicit check alongside the project suite.
