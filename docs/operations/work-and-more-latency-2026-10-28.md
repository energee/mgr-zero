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
- **Prefetch lengthens network idle but not the usable time.** Each Work page issues 48–68 prefetch requests. Blocking them roughly halved local network-idle time (median 0.39 s to 0.17 s). The time to main content did not change. So no prefetch fix is made.
- **The live gap is in the hosted stages.** QA saw 4–6 s to network idle and 3–10 s saves on live. Local runs of the same work take a tenth of that. So the cost is hosted: cold starts, the network between Vercel and Supabase, and the hosted prefetch requests. This run could not split those stages. See "Not measured".
- **No bounded fix is filed.** The owner's rule is one fix per concrete slow stage, with its numbers. No local stage was slow, and the hosted stages were not measured.

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
Live signed-in pages and live saves are not yet measured against them.

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
Prefetch therefore adds network traffic, not a usability delay.

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

- **Live signed-in pages.** No live staff credential was available to this run, so the 16 signed-in pages were not timed on live. The local numbers above stand in for app cost only.
- **Live saves.** The owner ruled them out: they write real records.
- **Hosted stage split.** Separating cold start, Vercel-to-Supabase network and RPC on live needs Vercel function logs or a Server-Timing header on the hosted app. Either is a hosted change, which is ask-first.
- **Phone or throttled network.** All runs were on a laptop. A driver's phone on cellular will be slower than both columns.

## What would close the gap

The local and live numbers differ by about ten times.
A hosted measurement is the next step.
Time the same signed-in pages on live with the QA account.
For one Ship and one page load, read the Vercel function duration and the Supabase request log for the same request.
That splits cold start from database latency.
Once deployed, the app's own stage timings give the same split; see "Stage timings" in [`pilot-latency-protocol.md`](pilot-latency-protocol.md).
After that split, a bounded fix can target the measured stage.
