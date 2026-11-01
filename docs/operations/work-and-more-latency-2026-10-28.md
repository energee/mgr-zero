<!-- Timing record for #1490 (Work pages and saves) and #1491 (docs, lot trace, Settings, Import); owner-approved 2026-10-27. -->
# Work and More pages latency, live and local (2026-10-28)

Measured evidence for [#1490](https://github.com/energee/mgr-zero/issues/1490) and [#1491](https://github.com/energee/mgr-zero/issues/1491).
The owner decided on 2026-10-27 to time both issues in two places.
Live timing is read-only page loads.
Local timing covers the same page loads plus each save.
The method follows [`pilot-latency-protocol.md`](pilot-latency-protocol.md).
This record does not fill that protocol's pilot authorization table.

## Summary

- **Local app cost is small.** Every timed page showed its main content within 0.32 s warm and 0.40 s on the first load after a restart.
- **Local saves are fast.** Each save showed its result within 0.24 s cold and 0.21 s warm. The `/api/command` round trip was 0.08–0.10 s cold and 0.03–0.04 s warm.
- **The RPCs are not the slow stage.** Each #1491 save RPC took 2–21 ms against the local database.
- **Prefetch lengthened network idle in this run.** Each Work page issued 48–68 prefetch requests. Blocking them roughly halved local network-idle time (median 0.39 s to 0.17 s). The time to main content did not change. Later stage timing found contention from record-page prefetches; see "Follow-up evidence for #1490".
- **The hosted cause is not established.** QA reported 4–6 s to network idle and 3–10 s saves on live. These local runs were faster, but that comparison alone cannot distinguish hosted cold starts, network latency, database cost or prefetch contention.
- **No bounded fix was filed from this run.** The owner's rule is one fix per concrete slow stage, with its numbers. The later 2026-10-29 run identified separate causes and filed them; the signed-in hosted measurements remain open.

## Metric and limits (owner, 2026-10-28)

The owner chose these for #1490 and #1491.

| Measure | Limit |
| --- | --- |
| Page | Main content and primary action usable within 2 s |
| Save, warm | Result shown within 1 s (the #1403 limit) |
| Save, cold | Result shown within 3 s (the #1403 limit) |

Network idle is not the page metric.
So prefetch traffic after the page is usable is not a defect.
Every local page and save below is within these limits.
The live docs pages are too.
Live signed-in pages are not yet measured against them. Live saves are prohibited by the owner's read-only decision.

## Staff guide weight (owner, 2026-10-28)

The owner chose to lazy-load the guide's `<Screen>` frames if timing showed HTML weight as the cost.
It did: the 108 frames' Mobile/Desktop switches were 474 KB of the live guide's 1,015 KB of markup.
The rest was 593 KB of inline React data.
The iframes themselves already loaded lazily.
Now each switch and frame mounts only when its figure is within one screen of the viewport (`components/mgr/screen-embed.tsx`).
Until then the figure is an empty box of the frame's starting height.
The guide keeps its single page and its `/docs` links.

## Code changes in the timing PR (#1576)

These two #1491 items needed no decision, so they ship with this record.

| Change | File | Effect |
| --- | --- | --- |
| Lot trace starts its lot read together with the sources, movements and ingredients reads | `lib/commands/compliance.ts` (`trace_lot`) | One fewer serial database round trip per lot trace. Locally a round trip takes a few milliseconds, so the saving shows only on hosted. |
| The Gateway model catalog is cached for an hour with `unstable_cache` | `lib/chat/models.ts` | A Settings render no longer waits on the Gateway once any instance has read the catalog. A failed read is not cached. |

The Gateway catalog read took 207 ms on its first call here (423 models, 219 KB).
The `@ai-sdk/gateway` provider already keeps the catalog in memory for 5 minutes per process.
So the new cache helps only a fresh serverless instance, which is the "Settings first load 2.7 s" case in #1491.

## Follow-up evidence for #1490 (2026-10-29)

The [stage-timing run recorded on the issue](https://github.com/energee/mgr-zero/issues/1490#issuecomment-6489057290) completed the local comparison with `next build` and `next start`, not development-mode timings.
It used the test stack at `127.0.0.1:54352`, schema `20261029001000`, and a fictional tenant with 20 SKUs, 30 customers and 30,400 ledger rows over two years.
The browser was headless Chrome through `agent-browser`, 1365 × 900, on a MacBook Air M4 over loopback.
These are previously recorded measurements, not a new run of this branch.

### Local page results

Seconds. Cold is the first load after `next start`; warm is the median of three loads.
Main content is Largest Contentful Paint, the recorded proxy for usable time; it does not independently prove that every primary action was interactive at that instant.

| Page | Cold first byte | Cold main content | Warm first byte | Warm main content |
| --- | ---: | ---: | ---: | ---: |
| Today (`/`) | 0.54 | 0.60 | 0.06 | 0.15 |
| `/work` | 0.22 | 0.30 | 0.04 | 0.10 |
| `/orders/new` | 0.10 | 0.14 | 0.03 | 0.20 |
| `/orders/<id>` | 0.11 | 0.16 | 0.07 | 0.14 |
| `/orders/<id>/confirm` | 0.10 | 0.14 | 0.06 | 0.10 |
| `/routes/new` | 0.09 | 0.13 | 0.06 | 0.12 |
| `/transfers` | 0.04 | 0.07 | 0.04 | 0.09 |
| `/purchase-orders` | 0.04 | 0.08 | 0.04 | 0.09 |
| `/purchase-orders/<id>` | 0.05 | 0.09 | 0.04 | 0.09 |
| `/vendors` | 0.05 | 0.10 | 0.06 | 0.10 |
| `/batches` | 0.04 | 0.08 | 0.03 | 0.08 |
| `/packaging` | 0.05 | 0.09 | 0.06 | 0.11 |
| `/pick` | 0.04 | 0.08 | 0.03 | 0.07 |
| `/replenishment` | 0.12 | 0.16 | 0.17 | 0.22 |

### Local command stages

Seconds for the HTTP total; milliseconds for the `Server-Timing` stages.
These totals end at the `/api/command` response, not at the refreshed screen.
The earlier end-to-end save and refresh measurements remain in "Local saves (#1490)".

| Command | Cold HTTP total | Cold auth / admission / command (ms) | Warm median HTTP total | Warm median auth / admission / command (ms) |
| --- | ---: | --- | ---: | --- |
| `confirm_order` | 0.208 | 44 / 16 / 42 | 0.046 | 8 / 7 / 28 |
| `record_pick` | 0.094 | 33 / 20 / 32 | 0.027 | 9 / 5 / 10 |
| `ship_order` | 0.075 | 17 / 15 / 35 | 0.036 | 7 / 6 / 16 |
| `confirm_delivery` | 0.057 | 13 / 13 / 18 | 0.027 | 7 / 5 / 10 |
| `receive_purchase_order` | 0.046 | 15 / 8 / 16 | 0.031 | 8 / 7 / 13 |
| `upsert_ship_to` | 0.030 | 8 / 7 / 11 | 0.025 | 7 / 6 / 8 |

### Concrete causes and disposition

| Finding | Recorded evidence | Separate outcome |
| --- | --- | --- |
| Record-page prefetch runs metadata reads and competes with the next page's reads | About 1.2 s of extra reads on Today or Pick; reads during a burst were 3–5× slower | [#1606](https://github.com/energee/mgr-zero/issues/1606), now closed, implemented the owner's `prefetch={false}` choice in [#1610](https://github.com/energee/mgr-zero/pull/1610), preserving record metadata and real 404s. The follow-up measured zero record-page prefetches on all four sampled pages. |
| Compliance activity scan ran on Settings and period pages that did not use it | Settings first byte 231 → 45 ms; its read 194 → 15 ms; period-page read 90 → 18 ms (five warm loads) | Fixed separately in [#1608](https://github.com/energee/mgr-zero/pull/1608). |
| Compliance activity scan read the ledger twice across its history | `destination_state_facts` 55 ms plus `report_movements` 21 ms at 30,400 rows | Filed separately as [#1607](https://github.com/energee/mgr-zero/issues/1607), now closed. |

### Remaining acceptance gate

The owner's local measurement and per-cause filing requirements have recorded evidence.
The hosted staff-page comparison still requires an owner-approved existing staff login.
On 2026-10-30, an unauthenticated read-only `GET /work` returned HTTP 307 to `/login?next=%2Fwork`; that response is an access check, not a staff-page timing.
No hosted signed-in timing, hosted stage attribution or all-pages performance pass is claimed here.
Keep #1490 open until that read-only comparison is recorded and any resulting concrete causes are dispositioned.
The 2026-10-29 comment's request to time live saves does not override the owner's explicit prohibition on hosted writes.

## Environment

| Field | Value |
| --- | --- |
| Source | `c786d227e` (origin/main) plus this PR's two changes |
| Live | https://mgr-zero.vercel.app, production, public docs pages only |
| Local build | `next build` and `next start` (Next.js 16.4.2, Node 24.19.0), not `next dev` |
| Local database | Test stack `supabase_db_mgr_test` on `127.0.0.1:54352`, schema `20261028005813` |
| Local data | One fictional tenant: 30 customers, one keg SKU, one lot, 155 shipped orders from that lot, 5 submitted and 5 picked orders, 5 departed one-stop routes, 5 sent purchase orders |
| Device | MacBook Air `Mac16,12`, Apple M4, macOS 27.0.1 |
| Browser | Headless Chrome for Testing 156 through `agent-browser`, 1365 × 900 |
| Network | Live: home Wi-Fi to Vercel. Local: loopback |
| Date | 2026-10-28, 17:00–17:30 UTC |

## How each number was taken

| Measure | Definition |
| --- | --- |
| Main content | Largest Contentful Paint, from navigation start. It stands in for "time to heading or primary action" on these pages. |
| Network idle | End of the last request before the first 500 ms with nothing in flight. |
| Last request | End of the last request within 6 s of the load. Prefetches can start after a quiet gap. |
| Process-cold | The first request to that route or command after `next start` restarted. The database and browser caches stayed warm. |
| Warm | Runs 2 onward in the same process and browser. |
| Save total | From the button click until the result showed, plus two frames. |
| `/api/command` | That request's start-to-end resource time; "server" is its time to first byte. |
| Refresh | Time from the command's response to the end of the next router request (`router.refresh()` or the follow-up navigation). |
| Prefetch off | Requests carrying `_rsc=` aborted during the load, then the same page timed again. |

## Live page loads (read-only)

Seconds. One first load in a fresh browser, then the median of three warm loads.

| Page | First: main content | First: network idle | Warm: main content | Warm: network idle | Warm: last request | Prefetch requests | HTML sent (KB) | HTML decoded (KB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/docs/staff-guide` | 0.42 | 1.82 | 0.24 | 0.79 | 1.55 | 15 | 289 | 1,608 |
| `/docs/screens` | 0.20 | 2.02 | 0.27 | 1.03 | 1.50 | 15 | 176 | 1,224 |

The staff guide's load event came at 0.54–1.13 s warm and 1.13 s first.
That matches QA's 0.9–1.2 s warm report.
The cost is document size and parsing, not the server: time to first byte was under 0.1 s.

## Local page loads

Seconds. "Cold" is the first load of the route after a restart; "warm" is the median of three.

| Page | Cold: main content | Cold: network idle | Warm: main content | Warm: network idle | Warm, prefetch off: network idle | Prefetch requests | HTML decoded (KB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/work` | 0.24 | 0.77 | 0.13 | 0.66 | 0.15 | 68 | 211 |
| `/orders/new` | 0.40 | 0.57 | 0.28 | 0.47 | 0.22 | 50 | 90 |
| `/orders/<id>` | 0.20 | 0.66 | 0.12 | 0.40 | 0.18 | 56 | 114 |
| `/orders/<id>/confirm` | 0.11 | 0.34 | 0.09 | 0.35 | 0.16 | 50 | 101 |
| `/routes/new` | 0.30 | 0.62 | 0.22 | 0.46 | 0.23 | 50 | 376 |
| `/transfers` | 0.11 | 0.33 | 0.17 | 0.37 | 0.14 | 48 | 116 |
| `/purchase-orders` | 0.12 | 0.40 | 0.09 | 0.43 | 0.17 | 60 | 141 |
| `/purchase-orders/<id>` | 0.16 | 0.40 | 0.15 | 0.40 | 0.19 | 50 | 115 |
| `/vendors` | 0.13 | 0.33 | 0.13 | 0.36 | 0.17 | 50 | 101 |
| `/batches` | 0.09 | 0.36 | 0.10 | 0.31 | 0.14 | 50 | 119 |
| `/packaging` | 0.13 | 0.35 | 0.13 | 0.32 | 0.16 | 50 | 135 |
| `/pick` | 0.12 | 0.51 | 0.08 | 0.39 | 0.16 | 57 | 145 |
| `/replenishment` | 0.17 | 0.39 | 0.10 | 0.34 | 0.19 | 48 | 117 |
| `/compliance/lots/<id>` | 0.36 | 0.72 | 0.21 | 0.54 | — | 59 | 1,090 |
| `/settings` | 0.29 | 0.49 | 0.10 | 0.33 | — | 50 | 214 |
| `/settings/import` | 0.16 | 0.35 | 0.12 | 0.27 | — | 52 | 112 |
| `/docs/staff-guide` | 0.35 | 1.56 | 0.20 | 1.12 | — | 15 | 1,607 |
| `/docs/screens` | 0.20 | 0.59 | 0.32 | 1.82 | — | 15 | 1,223 |

With prefetch off, the time to main content moved by less than run-to-run noise (median 0.13 s on, 0.10 s off, across the 13 Work pages).
This comparison did not measure contention on a subsequent navigation. The later stage-timing run found that cost and tracked it separately in #1606.

The lot trace page sent 1,090 KB of HTML for a lot with 155 shipments.
It is the only app page here over 400 KB.

## Local saves (#1490)

Seconds. One process-cold run after a restart, then four warm runs.
Each save is one `/api/command` call.

| Save | Cold total | Cold `/api/command` | Warm median total | Warm runs | Warm `/api/command` | Warm server | Warm refresh | Router requests after the save |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Confirm order | 0.20 | 0.08 | 0.14 | 0.13, 0.14, 0.15, 0.14 | 0.03 | 0.03 | 0.07 | 31 |
| Ship order | 0.12 | 0.09 | 0.08 | 0.08, 0.06, 0.09, 0.07 | 0.04 | 0.04 | 0.01 | 34 |
| Delivered | 0.18 | 0.10 | 0.09 | 0.08, 0.10, 0.08, 0.10 | 0.03 | 0.03 | 0.03 | 1 |
| Receive purchase order | 0.21 | 0.08 | 0.12 | 0.11, 0.13, 0.12, 0.09 | 0.04 | 0.04 | 0.05 | 31 |
| Save ship-to | 0.24 | 0.08 | 0.18 | 0.18, 0.21, 0.18, 0.18 | 0.04 | 0.03 | 0.06 | 29 |

After most saves, the router refreshes and then prefetches every visible link again, 29–34 requests.
Delivered sets `refresh: false` and navigates once, so it makes one.
Locally these finish within 0.1 s. On live, each is a separate function request.

## Local saves and stages (#1491)

Seconds. Each command was sent to `/api/command` from the signed-in page, as `lib/commands/client.ts` sends it.
Import is one valid customer row.

| Command | Process-cold | Warm runs | Warm median |
| --- | ---: | --- | ---: |
| `import_csv` | 0.21 | 0.05, 0.03, 0.03 | 0.03 |
| `upsert_material_contract` | 0.09 | 0.04, 0.02, 0.02 | 0.02 |
| `upsert_sale_channel` | 0.10 | 0.03, 0.01, 0.01 | 0.01 |
| `upsert_brewery_state_license` | 0.15 | 0.04, 0.03, 0.03 | 0.03 |

The RPCs alone, called through Supabase from a script, took these milliseconds (4 runs each):

| RPC | Runs (ms) |
| --- | --- |
| `begin_csv_import` | 21, 4, 2, 2 |
| `import_csv_row` | 7, 5, 3, 2 |
| `upsert_material_contract` | 7, 5, 2, 2 |
| `upsert_sale_channel` | 6, 4, 2, 2 |
| `upsert_brewery_state_license` | 4, 6, 2, 2 |

The two serial import RPCs cost under 30 ms together, so `import_csv` gets no change.
The rest of each local cold request is the Next handler warming up, which hosted cold starts repeat.

## Not measured

- **Live signed-in pages.** No live staff credential was available to this run, so the 16 signed-in pages were not timed on live. The local numbers above measure local app cost, not hosted performance.
- **Live saves.** The owner ruled them out: they write real records. Do not run Ship, Delivered, Confirm, Receive PO or Save ship-to on hosted.
- **Hosted stage split.** Reading existing response headers and authorized function logs is read-only. Deploying instrumentation or changing hosted settings is a separate action and is not authorized. Stage instrumentation subsequently merged in [#1596](https://github.com/energee/mgr-zero/pull/1596); its presence on a hosted response must be observed, not assumed from the merge.
- **Phone or throttled network.** All runs were on a laptop. No driver's-phone or cellular result is claimed.

## What would close the gap

Use an owner-approved existing staff login to time the same signed-in pages on live.
Record one first-browser load and at least three warm loads for every #1490 page: Today, Work, New order, Order detail, Confirm order, New route, Transfers, Purchase orders, PO detail, Vendors, Batches, Packaging, Pick and Replenishment.
Record the main content and primary action becoming usable, first byte, payload size and any `session` response stage.
A first-browser load is not proof of a serverless cold start.
If existing function logs are accessible, correlate the page request with its `shell` and page-read stages.
If headers or logs are unavailable, retain that evidence gap rather than infer the slow stage.
Do not time a hosted save; save and refresh timing belongs on the seeded local stack.
File any newly measured concrete cause as its own bounded fix.
No deploy, hosted setting change or credential provisioning is part of this measurement.

## #1491 read-only follow-up (2026-10-30)

The [2026-10-29 issue comment](https://github.com/energee/mgr-zero/issues/1491#issuecomment-6489057530)
records newer local production-build measurements with stage timings.
All pages showed main content within 0.60 s on their first load and 0.26 s warm.
The four #1491 saves took 0.026–0.040 s cold and 0.022–0.035 s warm through `/api/command`.
The Compliance period switch took 0.08–0.19 s before the activity-query fix.
The reported four-second dev-mode switch did not reproduce in that production build.
These are the prior run's results, not new local measurements.

The bounded fixes have already landed:

| Cause | Outcome |
| --- | --- |
| Guide frame controls mounted before they were visible | [#1587](https://github.com/energee/mgr-zero/pull/1587) defers mounting until near the viewport, without splitting the guide. |
| Lot trace waited for its lot read before starting other independent reads | #1576 starts those reads together. |
| Settings read the Gateway model catalog on each render | #1576 caches successful catalog reads for one hour. |
| Settings unnecessarily ran the Compliance activity scan | [#1608](https://github.com/energee/mgr-zero/pull/1608) separates the activity query from the report list. |
| Record-link prefetch repeated metadata reads | [#1606](https://github.com/energee/mgr-zero/issues/1606) is closed. |
| The Compliance activity scan read the ledger twice and over its whole history | [#1607](https://github.com/energee/mgr-zero/issues/1607) is closed. |

### Public hosted pages

Read-only browser timing on `https://mgr-zero.vercel.app`, 2026-10-30
05:25:44–05:26:27 UTC, used a dedicated `fix-issue-1491` agent-browser session
and headless Chrome 156.0.0.0 on this macOS arm64 workstation.
No network or CPU throttling was applied.
The first guide navigation used a fresh browser session.
The first inventory navigation reused that session, so neither is a claim of a cold hosted function.
Each page then had three repeated document navigations in the same session.
The hosted deployment SHA was not established.
`vercel inspect https://mgr-zero.vercel.app --json` refused with `forbidden` / `Not authorized`.
That also leaves matching hosted function-log access unproved.

The Navigation Timing entry supplies first byte and body sizes.
A buffered Largest Contentful Paint observer supplies main-content timing.
LCP is a main-content proxy; it does not prove that every interactive control is ready.
The numbers below are seconds, with each warm observation retained.

| Page | First: first byte | First: LCP | Warm first byte, all three | Warm LCP, all three | Warm LCP median | Encoded / decoded bytes |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| `/docs/staff-guide` | 0.091 | 1.536 | 0.025, 0.018, 0.015 | 0.312, 0.260, 0.232 | 0.260 | 287,652 / 1,162,904 |
| `/docs/screens` | 0.015 | 0.380 | 0.015, 0.014, 0.020 | 0.268, 0.212, 0.368 | 0.268 | 176,943 / 1,219,741 |

Every navigation exposed only `prerendered;dur=0` in `Server-Timing`.
These public-page LCP observations are below two seconds.
They do not measure the session, page-read, or save stages of a signed-in route.
No new slow stage was established, so this follow-up makes no speculative application change.

### Remaining #1491 acceptance gate

Opening `/settings` in that isolated session redirected to
`/login?next=%2Fsettings` and showed the Sign in form.
The browser credential vault had no saved profiles.
No credentials were submitted, no sign-in email was requested, and no hosted save was attempted.

#1491 stays open pending an approved hosted staff session.
Use it to time `/compliance/lots/<id>`, `/settings`, `/settings/import`,
and the Monthly / Quarterly / Annual switch on `/compliance`.
Select an existing lot through the live application; do not create a fixture on hosted.
Record the first observation and repeated warm observations, plus the hosted deployment SHA.
Split each observation into stages as in "Stage timings" in [`pilot-latency-protocol.md`](pilot-latency-protocol.md); the function log lines need owner access.
Log access and reading existing headers do not authorize a deploy or a setting change.

Keep the owner's 2026-10-27 boundary: hosted timing is read-only.
The local Import, contract, channel, and license save timings above do not authorize repeating those saves on hosted.
Only a measured slow stage should produce a separate bounded fix.
