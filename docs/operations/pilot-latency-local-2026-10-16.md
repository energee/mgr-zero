# Supplemental local pilot-volume latency evidence

**Measured, not a protocol-only proposal.** This run supplements [#728](https://github.com/energee/mgr-zero/issues/728) and the release index [#311](https://github.com/energee/mgr-zero/issues/311). It does **not** close the real-pilot measurement gate or establish hosted release readiness.

**One observed warm report run exceeded 1 second: T4 warm run 2 took 1.046 seconds.** It is retained below without a retry. All four tasks met the protocol's explicitly defined **warm-median / first-cold** acceptance statistic, with zero task errors. This is not an all-observations-under-limit claim.

## Authority and exact revision

The owner's [2026-10-16 decision](https://github.com/energee/mgr-zero/issues/728#issuecomment-6222006467), recorded in [PR #941](https://github.com/energee/mgr-zero/pull/941), supplies the agreed volumes and limits. The existing [pilot latency protocol](pilot-latency-protocol.md) defines task acceptance as a warm median at or below 1 second, a first cold run at or below 3 seconds, and no failed runs. This supplement uses that rule rather than changing it after seeing results.

The current assignment authorized a disposable local synthetic dataset, local buyer submission and staff confirmation, and the protocol's proposed compliance-period report for this supplement. The parent coordinator granted the dev database and an exclusive final timing window. That authorization does not fill the owner's still-open authorization table for real pilot data.

| Field | Observed value |
| --- | --- |
| Application source SHA | `b74c620869b7fa98e61b588ab36e8b183d8b2708` |
| Database schema | All 142 migration versions matched this revision; latest `20261016130000` |
| Build/runtime | `next build` / `next start`, Next.js 16.4.2, Node 24.19.0; not `next dev` |
| Build proof | `bun run build`: exit 0, 41.13 seconds; an earlier saturated-host attempt timed out during TypeScript and is not a passing build |
| Measurement interval | 2026-10-16, 21:01:36–21:02:34 UTC |
| Operator | Coding agent, under the owner's delegated local authorization |
| Local environment | Application `http://localhost:3728`; Supabase API `http://127.0.0.1:54341`; confirmed `supabase_db_mgr`, Postgres `127.0.0.1:54342`, version 17.6 |
| Device | MacBook Air `Mac16,12`, Apple M4, 10 cores (4 performance / 6 efficiency), 32 GB RAM |
| OS/browser | macOS 26.6.2 (25G83), Darwin 25.6.0 arm64; headless Chrome 155.0.0.0; 1365 × 900 viewport |
| Network | Unthrottled loopback between browser, application and local Supabase; not office Wi-Fi, mobile or hosted-network evidence |
| Isolation | Other agents held local builds, tests, browsers, database operations and probes during the final 32-sample pass |

No hosted setting, deployment, dependency, provider credential or real customer source was changed. No Square, QuickBooks, Slack, email-delivery or model acceptance is claimed. The local confirmation writes were not provider-delivery tests.

## Dataset actually measured

Only fictional tenant `04019e51-6744-4058-9ff2-ef805583b685` (`Pilot latency 728 disposable`) was bulk-loaded. Existing `tests/helpers.ts` ownership was reused for the local staff, buyer, customer and warehouse setup. The staff was a single-tenant admin, and the buyer had only membership in the synthetic customer. The [raw evidence](pilot-latency-local-2026-10-16.json) records the tenant, customer and older-order identifiers; no credentials or session tokens are included.

| Measure | Agreed count | Count before timing | Count after timing |
| --- | ---: | ---: | ---: |
| Active SKUs | 150 | 150 | 150 |
| Customers | 90 | 90 | 90 |
| Ship-tos | 120 | 120 | 120 |
| Historical orders, plus timed submissions | 9,000 | 9,000 | 9,008 |
| Order lines | 45,000 | 45,000 | 45,008 |
| Inventory ledger rows | 90,000 | 90,000 | 90,000 |
| Invoices | 9,000 | 9,000 | 9,000 |
| Invoice lines | — | 45,000 | 45,000 |

The reproducible distribution was:

- 50 fictional brands × 3 packaged can-case formats = 150 active SKUs. All formats were priced on the buyer's Wholesale channel.
- 90 rotating customers, each with a primary ship-to; the last 30 also had a second ship-to.
- 9,000 shipped orders evenly spaced across 730 days, from 2024-10-16 00:00:00 UTC through 2026-10-15 22:03:12 UTC. Order `i` used customer `1 + ((i - 1) mod 90)`.
- Five lines per historical order, rotating all 150 SKUs, with two units per line. Each order had one shipment, one invoice and five invoice lines.
- 90,000 ledger facts: 150 opening balances of 20 units on 2024-10-01, 44,850 production entries of two units, and 45,000 taxable Pennsylvania sale removals of two units. This left positive stock for the eight timed orders; confirmation added eight allocations, not ledger movements.
- The selected September 2026 report contained 3,700 period ledger rows, 370 invoices and 1,850 invoice lines. A read-only REST readiness probe returned `balances: true` and 3,700 destination-state transactions.

This is representative **row volume**, not a claim of representative business variety. The fixture has one warehouse, only can-case formats, a regular order distribution and no cellar production, keg-return, multi-state, provider, concurrent-user or real-data complexity. It does not reuse the separate Beer-overview performance proof in [PR #915](https://github.com/energee/mgr-zero/pull/915): that change was not in the measured source revision, and T4 is the compliance report, not the Beer landing.

## Timing boundaries and cache conditions

Timing used `performance.now()` inside the browser, starting on the captured user input/click event. A `MutationObserver` watched the task-specific usable result; the clock stopped after two `requestAnimationFrame` callbacks. CLI startup, login, cart preparation, server startup and human think time are outside the task interval. No network response alone was treated as a usable screen.

| Task | Start | Usable result required before stopping |
| --- | --- | --- |
| T1 Older-order lookup | Input event entering `ORD-0081` in the staff Search sheet opened from `/orders` | The exact result was selected immediately by automation, then its order detail showed `PILOT-00001` and SKU lines. The order was created 2024-10-16, two years before measurement. The interval includes the application's search debounce, search result and detail rendering, but not human result-selection delay. |
| T2 Buyer submission | **Place order** click on a reviewed cart for two units of `Pilot SKU 001` | The new `/portal/orders/[id]` detail showed **Placed** and the submitted SKU. Each repetition created a different order. |
| T3 Staff confirmation | **Confirm order** click on the corresponding T2 order's review page | The application returned to `/orders`, and the row linking that exact order showed `confirmed`. Final SQL independently found all eight timed orders confirmed. |
| T4 Representative report | September 2026 report link click from `/compliance` | `/compliance/2026-09` showed both **Destination-state totals** and the final **Confirm filed outside MGR** section. No report was filed. |

**Process-cold** means the production Node application process was stopped and a fresh process reached its Ready handshake before the action. The prepared authenticated browser remained open. Browser assets, PostgreSQL, PostgREST and operating-system caches were **not** flushed. These are not database-cold, browser-cache-cold, device-boot or hosted-serverless cold-start measurements.

**Warm** means the application process was reused. Before each repetition, automation opened the source page and prepared the same action again. T2 and T3 were paired, so every confirmation used the newly submitted order rather than replaying an idempotent confirmation.

The final pass ran once, sequentially, with three process-cold and five warm repetitions per task. No final repetition was dropped, replaced or retried. The raw JSON retains unrounded elapsed milliseconds, UTC starts, routes and failure flags for all 32 runs.

## Complete results

All numbers below are **seconds**, rounded to four decimals. Limits are 1 second for the warm median and 3 seconds for the first process-cold run. Every process-cold observation was also below 3 seconds.

| Task | Condition | Elapsed times, in execution order | Median | Maximum | Task errors | Protocol statistic met |
| --- | --- | --- | ---: | ---: | ---: | --- |
| T1 Older-order lookup | process-cold | 0.5624, 0.7351, 0.9336 | 0.7351 | 0.9336 | 0 | Yes: first 0.5624 ≤ 3 |
| T1 Older-order lookup | warm | 0.5467, 0.6077, 0.6229, 0.5832, 0.6796 | 0.6077 | 0.6796 | 0 | Yes: median 0.6077 ≤ 1 |
| T2 Buyer submission | process-cold | 1.0692, 0.7066, 0.6346 | 0.7066 | 1.0692 | 0 | Yes: first 1.0692 ≤ 3 |
| T2 Buyer submission | warm | 0.2280, 0.1925, 0.2978, 0.2690, 0.2313 | 0.2313 | 0.2978 | 0 | Yes: median 0.2313 ≤ 1 |
| T3 Staff confirmation | process-cold | 1.2192, 0.6974, 0.7804 | 0.7804 | 1.2192 | 0 | Yes: first 1.2192 ≤ 3 |
| T3 Staff confirmation | warm | 0.2967, 0.3317, 0.5515, 0.4310, 0.3577 | 0.3577 | 0.5515 | 0 | Yes: median 0.3577 ≤ 1 |
| T4 September compliance report | process-cold | 1.1171, 0.6574, 0.7717 | 0.7717 | 1.1171 | 0 | Yes: first 1.1171 ≤ 3 |
| T4 September compliance report | warm | 0.7435, **1.0460**, 0.8295, 0.7392, 0.7612 | 0.7612 | **1.0460** | 0 | Yes: median 0.7612 ≤ 1; one observation exceeds 1 |

### Failures, excluded attempts and outlier disposition

- **Final application task errors: 0/32.** No final run needed a retry. The eight real local submissions became eight confirmed orders; SQL counted 9,008 total orders, 45,008 order lines and eight allocations afterward.
- **T4 warm run 2: 1.046 seconds at 21:02:28.373 UTC.** This is an above-1-second observation, not a task error or failure of the approved median criterion. Its cause was not established by this run. No speculative optimization, unsupported performance-bug issue or replacement sample was introduced. Real-pilot measurements must retain tail observations too.
- **Earlier harness failure:** the Bun-driven runner reached its 1,800-second deadline before any timing row. Afterward there was no listener on port 3728 and the browser remained on an empty Search sheet. [INFERENCE] It stalled awaiting its first cold-process restart, before the timed input action. This is not application task latency. The temporary runner was changed to Node with bounded termination of only its owned process.
- **Excluded calibration/cancellation:** a subsequent corrected attempt produced five successful T1 observations before a parent pause arrived. That runner was immediately cancelled, and those five observations were preserved separately and excluded from the final acceptance sample. They were not substituted for any final result.
- **Restart readiness:** three independent startup/shutdown cycles then verified the production listener and bounded shutdown before the final exclusive window. Each process was ready within 495 ms and its listener absent within 342 ms of termination. These readiness figures are not task measurements.

The [raw evidence](pilot-latency-local-2026-10-16.json) includes both excluded-attempt records and all five excluded calibration observations alongside, but separately from, the 32 final runs.

## Cleanup and remaining gates

The runner closed both named browser sessions and its production server. Scoped cleanup removed only the fictional tenant's rows and its two newly seeded Auth accounts: 207,524 tenant-owned fixture rows removed, with zero remaining fixture tenants or accounts. No database was reset. Temporary seeding, measurement and cleanup scripts were removed rather than becoming another permanent harness.

The following remain open under [#311](https://github.com/energee/mgr-zero/issues/311) and [#728](https://github.com/energee/mgr-zero/issues/728):

1. The owner must still name the actual pilot environment, real dataset source, permitted write location and staff/buyer accounts, and confirm the pilot's representative T4 report. This local choice does not approve those real-data decisions.
2. Measure real pilot data during the first weeks, as the [2026-10-11 pilot-first decision](https://github.com/energee/mgr-zero/issues/311#issuecomment-6112356491) requires. This synthetic run is supplemental evidence, not a substitute or a new launch blocker.
3. Attach measurements, dataset counts and failures to the **eventual integrated release SHA**. The SHA above is exactly what was measured, not a prediction of the final release revision or a deployed SHA.
4. Complete the separately owned exact-release CI, hosted smoke, provider acceptance, backup/restore and other applicable release gates. Local timings, this evidence PR's CI and a successful production build do not satisfy them.
