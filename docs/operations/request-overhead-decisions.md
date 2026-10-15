# Per-request overhead: open decisions (#759)

#759 listed hot-page reads and per-request overhead.
#780 and #790 shipped every code item.
Two items remain; each changes product behaviour, so each needs an owner decision.
Record the decision in the table, then close #759.

## 1. Admission row on every `/api/command`

What it is: `consume_command_admission` (`lib/commands/admission.ts`) writes one row per request.
It is the per-user throttle: 120 requests a minute per signed-in user, shared by `/api/command` and `/api/chat`.
It fails closed: if the RPC fails, the request gets 503 `admission_unavailable`.

| Option | Effect |
| --- | --- |
| **Keep (recommended)** | No change. One small insert per request buys abuse protection. Revisit only if #728's latency run shows it on the critical path. |
| Sample | Count only some requests. A burst can exceed the limit before it trips. |
| Drop | No per-user rate limit. Not advised before release. |

## 2. Orders list polls every 5 seconds

What it is: `lib/commands/query-cache.ts:19` refreshes `list_orders` every 5 s while the tab is visible; every other cached read uses 30 s.
`docs/testing/route-data-cache.tdd.md` records 5–10 s as the chosen freshness target, `tests/query-cache.test.ts` pins it, and the staff guide promises "every five seconds".
Polling pauses in hidden tabs.

| Option | Effect |
| --- | --- |
| **Keep 5 s (recommended)** | No change. Staff see a buyer's new order within seconds. |
| Raise to 10 s | Half the reads, still inside the recorded target. Change the constant, the test, and the staff guide sentence together. |
| Raise to 30 s | Same cadence as other lists. Outside the recorded target. |

## Decision record

| Item | Decision | Owner | Date |
| --- | --- | --- | --- |
| Admission row | | | |
| Orders poll | | | |

If both stay as they are, close #759 with a link to this record.
Any change is a follow-up PR that updates the code, its pinned test and the staff guide together.
