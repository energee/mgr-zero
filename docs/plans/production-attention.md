# Production needs attention

Status: proposed feature; first synthetic Jev experiment completed. No product integration or database changes yet.

## Goal

Give production managers one evidence-backed answer to "What needs my input?" Start with fermentation follow-ups and packaging runs. Do not add import features, readiness percentages, autonomous production changes, or demand forecasting.

## Existing owners and reuse

- `lib/commands/today.ts`: `TodayItem` already carries a reason, subject, source version, link, due time and recipient roles. Reuse that vocabulary and the existing overdue-reading rule; do not create a second overdue scheduler.
- `lib/commands/production.ts`: batches, occupancies, fermentation readings and operator notes. Use the exact occupancy for live fermentation context; do not treat another tank in the same batch as resolving its concern.
- `lib/commands/packaging.ts`: run plans, optional source occupancy, start/close, planned outputs, material plan and revision. A missing tank matters before start, not merely because the optional field is blank on a future plan.
- `lib/commands/registry.ts` and `lib/chat/agent.ts`: authorized reads and confirmed command proposals. UI, HTTP and future MCP callers must use the same domain operations.
- Existing Zod dependency, native fetch and Bun scripts are sufficient for the experiment. No TypeSafe SDK or other dependency is needed.

## Attention semantics

| Kind | Owner | Example | Resolution |
| --- | --- | --- | --- |
| Missing input | Deterministic rule | Run cannot start without a source tank | Re-read the source condition |
| Known blocker | Deterministic rule | Reviewed close needs more material than the exact sources hold | Re-read material availability and revision |
| Possible concern | Jev-assisted interpretation | Note requests another gravity check before packaging | Explicit relevant evidence or manager disposition |

Optional blank fields are not tasks. Absence of a concern is not process approval. A later temperature-only reading does not settle a gravity follow-up. Partial completion does not close a multi-part concern. A newer concern can reopen work that an older note resolved.

## User experience

Show Needs attention on the production overview. Group findings by batch or run while retaining each reason. Each item names the missing input or concern, why it matters, its source evidence, and a link to the existing action. Separate known blockers from inferred concerns.

Use fixed labels and verbatim source excerpts. Jev does not generate explanations. Offer Not an issue, Snooze and Resolve for inferred concerns. These actions affect the concern only; they never complete a batch, clear an exact blocker or record a measurement. Dispositions must attach to the exact source version so unchanged notes do not reappear and new evidence can be reviewed.

## Proposed domain contract

Add a production-attention query at the existing command boundary after the experiments justify integration. Return subject type/id, stable reason code, deterministic/inferred origin, source references/version, observed time, due time when known, review state and allowed destination. Jev supplies semantic judgments, not authorization or navigation URLs.

Fetch authorized facts before inference. Filter by subject and order evidence in code. Keep arithmetic, date comparison, stock calculations and production eligibility outside the model. Return unknown when evidence is insufficient. A provider failure must be visible and must not hide deterministic items.

## Persistence and database boundaries

Derive exact blockers from existing records. Evaluate new or changed notes outside write transactions. Persist inferred findings and review dispositions only where they need memory. Key a finding by brewery, subject, source version and reason; retain evidence references and model/question versions. Preserve acknowledged unresolved concerns when a refresh fails.

Before schema design, verify existing Today/chat occurrence and snooze ownership. Do not reuse Slack-specific delivery state as a domain concern store. Any new table needs tenant-composite references, RLS and explicit role checks. Use new migrations and the existing lock workflow. Do not add attention flags to batches or inventory movements.

## Experiments

`scripts/experiment-production-attention.ts` evaluates the labeled synthetic cases in `scripts/production-attention-cases.json`. It uses only synthetic operator notes and synthetic subject references. It never reads a database, application credentials, customer details or real production notes. Only `TYPESAFE_API_KEY` is used for live inference.

Compare two formulations on the same state:

1. Direct Choice: open, resolved, no action or uncertain.
2. Decomposed Choices: whether any follow-up/concern exists and whether all relevant requested work has explicit resolution. Code combines the judgments conservatively.

Both formulations share a separate supporting-note selection question. Run each case with normal and reversed criterion order. Labels and case IDs are excluded from model state. Questions cannot depend on one another's answers. A partial or uncertain resolution keeps work visible. The benchmark's resolved result is experimental evidence, not permission to auto-close a production concern.

The decomposed truth table returns no action only when both judgments agree there was no follow-up. Contradictory judgments return uncertain. An explicit not-applicable resolution option avoids forcing a completion answer for routine notes. The missed-concern count includes both open and uncertain cases incorrectly classified as resolved or no action.

The initial corpus covers open fermentation and packaging requests, routine and negated notes, explicit and partial resolutions, irrelevant later readings, wrong-subject evidence, reopened work, absent notes, ambiguous status and an instruction-injection attempt. Every case is evaluated separately to avoid cross-case contamination. Reversing criteria doubles calls without changing note chronology. The initial live run is bounded to twice the fixture count, uses a pinned model and performs no automatic retries.

The label policy distinguishes an outstanding request with no completion update (open), a later note explicitly reporting unknown completion (uncertain), and a fresh request to confirm that unknown status (open). Both open and uncertain remain visible for review.

Normal/reversed pairs are an initial stability probe. A difference can reflect repeat-call variation, not necessarily option-order bias; add same-order repeats before attributing a cause.

### Commands

```sh
# Validate fixtures and inspect exact outgoing requests. No API call or key needed.
bun scripts/experiment-production-attention.ts --dry-run

# Set TYPESAFE_API_KEY locally; never commit or paste the key.
# Sends synthetic cases to https://api.typesafe.ai/v1/systemone.
bun --env-file=.env.local scripts/experiment-production-attention.ts --live
```

`bunx vitest run tests/production-attention-experiment.test.ts` exercises the real CLI without live inference. It checks rejected modes, missing live credentials, and exclusion of evaluation labels from dry-run model payloads.

The live command prints JSON lines containing each actual request, validated response, predicted labels, latency and token usage. API or schema failures are reported on stderr and fail the run; they are never converted to negative predictions. Save stdout and stderr outside the repository if retaining a run. Classification counts, missed open concerns, false alarms, unsafe resolutions and criterion-order instability are reported separately per formulation. Supporting-evidence accuracy, token usage and latency percentiles are shared because both formulations run in the same request. Semantic mistakes are experiment findings, not transport failures.

## Evaluation and decision gates

1. Validate request/response handling and inspect individual decisions before drawing aggregate conclusions.
2. Treat any resolved prediction on a labeled unresolved or uncertain concern as an unsafe resolution. Review these before considering any automatic concern closure.
3. Compare direct and decomposed formulations on the same cases. Check criterion-order stability and uncertain cases, not only average accuracy.
4. These author-written synthetic cases are a development set, not a release benchmark. Do not tune a confidence threshold and claim accuracy on the same examples. Build a separate brewer-reviewed holdout before product integration.
5. With explicit permission, evaluate minimized real notes and expert labels. Measure false alarms, missed follow-ups, time to review and manager dispositions. Respect the provider's data-processing terms; do not assume zero retention.
6. Ship initially as advisory review only. Selective precision and recall must be validated before introducing any confidence gate. A confidence value is distribution concentration, not demonstrated domain accuracy.

## Implementation sequence after experiment review

1. Define the exact packaging and fermentation attention rules against existing next-action requirements. Add behavior tests before changing those rules.
2. Add the authorized production-attention read and source-version handling. Ensure deterministic findings work without Jev.
3. Add semantic evaluation for new/changed notes, explicit unknown/error states and source-linked findings.
4. Add review dispositions and prove stale-evidence, tenant and role boundaries.
5. Build the shared production attention view using the screen-parity workflow. Link every item to an existing action. Update the staff guide and generated API reference.
6. Exercise the rendered page and real command paths, including provider failure, wrong occupancy, partial resolution and reopened concerns. Run applicable database, type, lint and screen checks.

## Observed results

The initial live attempt was blocked by missing credentials. After the key became available, `bun --env-file=.env.local scripts/experiment-production-attention.ts --live` completed all 48 requests against `jev-1.14.0`. Only the 24 synthetic cases were sent; no brewery records were read or changed.

Offline smoke: `--dry-run` validated 24 cases and generated 48 request payloads with zero requests sent. `bunx tsc --noEmit` and targeted ESLint passed. `bun run lint` passed with five warnings in files outside this change. These checks do not demonstrate Jev accuracy, end-to-end latency or successful provider response handling.

Evaluator smoke reproduced the contradictory-answer bug before correction and exercised all 12 follow-up/resolution combinations afterward. It also checked rejection of an unknown choice and inclusion of uncertain-to-no-action errors in missed-concern totals. A separate CLI payload smoke verified label exclusion and unchanged state across criterion-order variants. These are offline evaluator checks, not simulated model results.

### First live run

Raw requests and validated responses are preserved outside the repository at `/tmp/mgr-jev-production-attention-fff59a56-45e7-4163-b02a-0cb4df72299b.jsonl`. This is a temporary local evidence file, not a tracked fixture or durable results archive. The transcript also retains the run output.

| Measurement | Direct classification | Decomposed judgments |
| --- | --- | --- |
| Exact status agreement | 46/48 (95.8%) | 47/48 (97.9%) |
| Unresolved concerns hidden | 0/30 | 0/30 |
| False alarms on no-action cases | 0/10 | 0/10 |
| Unsafe resolved predictions | 0/30 | 0/30 |
| Status changes across normal/reversed pairs | 2/24 | 1/24 |

The shared supporting-note question selected an accepted note in all 48 requests. Measured client request latency, including network and response parsing/validation, was 77 ms median and 111 ms p95. Usage was 48,366 input tokens and 8,216 output tokens. At the documented $0.042 per million input tokens, the input-price estimate is $0.00203; this is not a verified billed charge.

All mismatches were uncertain-to-open classifications with reversed criteria. For `ambiguous-fermentation-status`, the direct answer became open while the decomposed answer remained uncertain. For `packaging-unclear-resolution`, both formulations became open. The latter direct answer had confidence 0.81 despite disagreeing with the expected label. Neither mismatch hid work or declared it resolved. The paired run does not separate option-order effects from repeat-call variation.

These are 24 short author-written development cases evaluated twice, not 48 independent cases or a production accuracy estimate. The marginal exact-status advantage does not yet justify choosing the more complex formulation. Both formulations agree on the coarse attention-visibility outcome throughout this corpus.

### Next experiment

Freeze the current questions before building a separate brewer-reviewed holdout. Include terse operator shorthand, several simultaneous concerns with different resolutions, reopened concerns embedded in longer histories, irrelevant updates, and ambiguous completion. Repeat the same criterion order as a control before attributing paired differences to ordering. Evaluate attention visibility separately from exact open/uncertain wording, and require correct source evidence. Do not tune a confidence gate on this development corpus or send real brewery notes without explicit permission.

Use the next experiment to decide whether the product needs to distinguish open from uncertain at all. Both require manager review; merging their presentation may be simpler, while retaining uncertain evidence internally. No automatic production action or concern closure is justified by this run.

## References

- https://docs.typesafe.ai/primitives/choice.md
- https://docs.typesafe.ai/confidence.md
- https://docs.typesafe.ai/models.md
- https://docs.typesafe.ai/model-jaggedness/jev-1.13.md
- https://docs.typesafe.ai/legal.md
