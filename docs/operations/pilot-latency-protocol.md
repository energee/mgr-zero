<!-- Protocol for timing four core tasks at pilot data volumes (#728); evidence goes to #311. -->
# Pilot latency protocol

Status: **volumes and limits agreed 2026-10-16; authorization awaiting owner**. Owner: Ted. Tracks
[#728](https://github.com/energee/mgr-zero/issues/728); evidence belongs to the
release index [#311](https://github.com/energee/mgr-zero/issues/311).

This protocol times four core tasks at a realistic pilot data volume.
It is release evidence, not a claim that the app is slow.
[`performance-baseline.md`](performance-baseline.md) owns bundle composition and field Web Vitals; neither replaces this measurement.

Per the #311 decision of 2026-10-11, this is pilot-time work, not a launch blocker.
Agree the volumes and limits before the pilot starts.
Measure during the pilot's first weeks.

## Authorization required before running

Nothing in this protocol may run until the owner records each item below.

| Item | Owner decision |
| --- | --- |
| Environment | Name the disposable environment, or name the pilot environment for read-only timing. |
| Dataset source | Real pilot data as it accumulates, or an approved disposable copy. Name which. |
| Timed writes | Name where order submission (T2) and confirmation (T3) may run. |
| Accounts | Name the staff and buyer accounts used for timing. |

Fixed limits, not owner choices:

- No production writes beyond those timed writes; no bulk load into production.
- No hosted setting changes.
- No new dependency or analytics package; a stopwatch or the browser's network panel is enough.

Authorized by: ____________ Date: ____________ Environment: ____________

## Pilot dataset volumes

Proposed defaults assume one small brewery with about a year of history.
Agreed values (owner, 2026-10-16) are 3× the pilot brewery's expected size:
about 50 SKUs, 30 customers and 30 orders a week over 2 years (about 3,000 orders).

| Measure | Proposed default | Agreed value | Measured count at run |
| --- | ---: | ---: | ---: |
| Active SKUs | 150 | 150 | |
| Customers | 300 | 90 | |
| Ship-tos | 400 | 120 | |
| Orders in history | 5,000 | 9,000 | |
| Order lines in history | 25,000 | 45,000 | |
| Inventory ledger rows | 50,000 | 90,000 | |
| Invoices in history | 5,000 | 9,000 | |

A run at volumes well below the agreed values is not evidence for this issue.

## Tasks to time

Each task starts at the user's action and ends when the result is usable on screen.

| # | Task | Start | End | Route |
| --- | --- | --- | --- | --- |
| T1 | Older-order lookup (staff) | Search submitted for an order at least 6 months old | That order's detail is readable | `/orders` → `/orders/[id]` |
| T2 | Buyer order submission | Buyer selects **Place order** on a reviewed cart | The submitted order is shown | `/portal` |
| T3 | Staff confirmation | Staff presses confirm on the T2 order | Order shows as confirmed | `/orders/[id]/confirm` |
| T4 | Representative report | Report requested | Report is fully rendered | Owner picks one; proposal: the compliance period at `/compliance/[period]` |

## Usable latency limits

| Task | Proposed warm limit | Proposed cold limit | Agreed warm limit | Agreed cold limit |
| --- | ---: | ---: | ---: | ---: |
| T1 Older-order lookup | 2 s | 4 s | 1 s | 3 s |
| T2 Buyer order submission | 3 s | 5 s | 1 s | 3 s |
| T3 Staff confirmation | 2 s | 4 s | 1 s | 3 s |
| T4 Representative report | 5 s | 10 s | 1 s | 3 s |

A task passes when the median of the warm runs is within the agreed warm limit.
The first cold run (first load after a deploy or an idle period) must be within the agreed cold limit.
Any failed run counts against the task, whatever its time.

## What to record per run set

The results table below holds the SHA, condition, run count and operator.
Also record, with the measured counts above:

| Field | Example |
| --- | --- |
| Environment | Project name and region, never keys |
| Device | Model, OS, browser and version |
| Network | Wired, office Wi-Fi, or phone hotspot |
| Elapsed times | Every run in seconds; at least 5 warm runs per task |
| Failures | Error text, timestamp, and whether a retry succeeded |

## Stage timings

The app reports where a request's server time went, so a slow hosted load or save can be split by stage ([#1490](https://github.com/energee/mgr-zero/issues/1490), [#1491](https://github.com/energee/mgr-zero/issues/1491)).
Each stage is written in the standard Server-Timing form, `name;dur=ms`.
Only stage names, command names and durations are written: never ids, secrets, inputs or query text.
The code is `lib/server-timing.ts`.

| Stage | Where it is reported | What it times |
| --- | --- | --- |
| `session` | `Server-Timing` header on every staff and portal page load and client navigation (`proxy.ts`) | The session refresh before the page renders |
| `auth` | `Server-Timing` header on every `/api/command` response | Building the caller's context: session or bearer token, and membership |
| `admission` | Same header | The per-account rate-limit check |
| `command` | Same header | The command or query itself, including its RPC |
| `shell` | Function log line | The staff layout's brewery, identity and membership reads, including brewery and personal gravity units (`app/(app)/layout.tsx`) |
| `<command name>`, for example `trace_lot` | Function log line | One staff page read through `runPageQuery` or `optionalPageQuery`; the layout reuses its membership reads instead of calling `get_gravity_unit` |
| `prerendered` | `Server-Timing` header on `/docs` pages | No server stage: the page was built at deploy, so its time is delivery and parsing |

A stage that fails is still timed.
Stages after it are missing because they never ran.

Server components cannot set response headers, so the shell and page reads go to the function log instead.
Each is one JSON line: `{"event":"server_timing","timing":"trace_lot;dur=48.1"}`.
The layout and the page render at the same time, so their stages overlap rather than add up.

### Reading it

1. **In the browser.** Open DevTools, Network, select the document or the `/api/command` request, then the Timing tab. "Server Timing" lists each stage. Or run `performance.getEntriesByType("navigation")[0].serverTiming` in the console for the page load.
2. **In the function log.** Find the same request in the Vercel function logs and read its `server_timing` lines for `shell` and each page read. Reading hosted logs needs owner access.
3. **Split the time.**
   - Network and cold start: the browser's waiting time (time to first byte) minus the server stages.
   - Session: the `session` stage.
   - Page reads: the longest of `shell` and the page's read lines.
   - Save: the `command` stage.

A page load with a large gap between its time to first byte and its stages points at a cold start or the network.
A large `command` or read stage points at that RPC.
File each slow stage as its own fix, with its numbers.

## Results

Fill one row per task per run set.
Attach the completed table to #311 with the release SHA.
Triage each measured failure as its own issue.

[Supplemental local measurements, 2026-10-16](pilot-latency-local-2026-10-16.md)
record all 32 production-runtime repetitions at the agreed synthetic volumes,
including the 1.046-second warm report observation. They do not fill this
protocol's real-pilot authorization table or replace pilot-time real-data evidence.

[Work and More pages, live and local, 2026-10-28](work-and-more-latency-2026-10-28.md)
time the #1490 and #1491 pages and saves. They are local and public-live
measurements, not pilot evidence.

| Date | Release SHA | Task | Condition | Runs | Median (s) | Max (s) | Failures | Within agreed limit | Operator |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| | | T1 | cold | | | | | | |
| | | T1 | warm | | | | | | |
| | | T2 | cold | | | | | | |
| | | T2 | warm | | | | | | |
| | | T3 | cold | | | | | | |
| | | T3 | warm | | | | | | |
| | | T4 | cold | | | | | | |
| | | T4 | warm | | | | | | |

## Out of scope

- Load or concurrency testing.
- Speculative optimization before a measured failure.
