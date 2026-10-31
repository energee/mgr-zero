# Per-request overhead: owner decisions (#759)

#759 listed hot-page reads and per-request overhead.
#780 and #790 shipped every code item.
The owner closed #759 on 2026-10-16 with both policies retained.
The [decision comment](https://github.com/energee/mgr-zero/issues/759#issuecomment-6221275554) supersedes the older open-decision wording in #1664.

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

What it is: `lib/commands/query-cache.ts` refreshes `list_orders` every 5 s while the tab is visible; every other cached read uses 30 s.
[`route-data-cache.tdd.md`](../testing/route-data-cache.tdd.md) records 5–10 s as the chosen freshness target, `tests/query-cache.test.ts` pins it, and the staff guide promises "every five seconds".

| Option | Effect |
| --- | --- |
| **Keep 5 s (recommended)** | No change. Staff see a buyer's new order within seconds. |
| Raise to 10 s | Half the reads, still inside the recorded target. |
| Raise to 30 s | Same cadence as other lists. Outside the recorded target. |

## Decision record

| Item | Decision | Owner | Date |
| --- | --- | --- | --- |
| Admission row | Keep the per-user throttle | energee | 2026-10-16 |
| Orders poll | Keep 5 seconds while visible | energee | 2026-10-16 |

Reference-list reads keep their current 30-second cache policy. These are deliberate freshness and abuse-protection choices, not a measured performance defect. Revisit only with measured load and a new owner decision.

## Follow-up audit (#1664)

Order detail starts independent header, line, event, shipment and deposit reads together. ATP and source stock still wait for the header and lines because their predicates need those results. Page reference reads, including locations, start together.

Movement history uses the existing `created_at~id` cursor contract. It returns `{ rows, nextCursor }`; callers pass `nextCursor` to continue instead of scanning an ever-growing offset. The filtered Orders and movement history indexes match their descending timestamp/id order. Keg aging is reduced under caller RLS in PostgreSQL before the report crosses the REST boundary; FIFO, excess returns, losses and tenant isolation remain unchanged.

The SKU-history index includes `qty` so tenant/SKU ledger sums remain index-only when the planner chooses it instead of the existing on-hand index. This preserves the portal-availability read path as well as the new cursor order.

The branch-owned performance migration `20261030031031` follows main's integration-failure migration (`20261030031030`). It adds the report aggregate and indexes, and drops the baseline `movements_created_idx`, whose `(brewery_id, created_at)` prefix the new `movements_history_idx` covers.

### Foreign-key evidence, not a per-column index mandate

Read-only `EXPLAIN (ANALYZE, BUFFERS)` on local test `:54352`, schema `20261029123000`, checked the audit's three named FK lookups. Each query selected `1` with the actual composite FK equality predicates and `LIMIT 1`; the referenced UUID was absent, so it exercised the no-match path.

| Lookup | Existing plan | Disposition |
| --- | --- | --- |
| `orders(sale_channel_id, brewery_id)` | Sequential scan; 1,241 rows removed, 34 shared-buffer hits | Add the two-column equality index |
| `purchase_orders(vendor_id, brewery_id)` | Sequential scan; 46 rows removed, one shared-buffer hit | Add the two-column equality index; the vendor-filtered PO list uses the same predicates |
| `inventory_movements(location_id, brewery_id)` | Index-only scan on `movements_onhand_idx`; both equalities in `Index Cond`, no heap fetches | Reuse it; no new location-leading ledger index |
| `inventory_movements(compensates_id, brewery_id)` | Index-only scan on the existing reversed-order unique key; both equalities in `Index Cond`, no heap fetches | Reuse it; no new compensation-leading index |

The audit's per-column count is not evidence that every column needs its own leading index. A composite FK can use an existing index in a different equality-key order, and a nullable-reference lookup can use a safe `IS NOT NULL` partial index. Adding an index for every catalog absence would amplify writes without demonstrating a workload benefit. The regression checks the demonstrated FK equality prefixes in either order and accepts safe nullable-key predicates. Exact planner choices depend on statistics and available indexes; the observed baseline location plan is evidence of existing index support, not a promise that every fixture chooses that index. Other unmeasured FK-index proposals are intentionally retained pending concrete lookup plans and workload evidence, not silently treated as fixed.

Lot-trace timing and call-count follow-up remain tracked in [#1491](https://github.com/energee/mgr-zero/issues/1491). Its hosted read-only timing gate is not waived by the local query improvements here.

### Auth verification evidence

The installed `@supabase/auth-js` implementation of `getClaims()` uses local WebCrypto verification only when the token has an asymmetric algorithm and key ID, WebCrypto is available, and a matching JWK is available. A cold JWK cache can fetch `/auth/v1/.well-known/jwks.json`. A symmetric token, absent key ID, missing WebCrypto, or missing signing key falls back to `getUser(token)`, which calls Auth. An expired cookie session may also refresh before verification. This matches the [Supabase API reference](https://supabase.com/docs/reference/javascript/auth-getclaims).

This is SDK evidence, not a hosted measurement. For [#1490](https://github.com/energee/mgr-zero/issues/1490), capture one hosted session's JWT **header only** (algorithm and key ID, never the token), the runtime's WebCrypto availability, and cold/warm Auth request counts. Do not change signing keys or session policy to make this measurement. Hosted authenticated timing remains an owner-access gate until that evidence exists; local signing configuration cannot establish which path the hosted session takes.
