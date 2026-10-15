<!-- Protocol for timing four core tasks at pilot data volumes (#728); evidence goes to #311. -->
# Pilot latency protocol

Status: **draft, awaiting owner values**. Owner: Ted. Tracks
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
The owner replaces them with the pilot brewery's expected numbers.

| Measure | Proposed default | Agreed value | Measured count at run |
| --- | ---: | ---: | ---: |
| Active SKUs | 150 | | |
| Customers | 300 | | |
| Ship-tos | 400 | | |
| Orders in history | 5,000 | | |
| Order lines in history | 25,000 | | |
| Inventory ledger rows | 50,000 | | |
| Invoices in history | 5,000 | | |

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
| T1 Older-order lookup | 2 s | 4 s | | |
| T2 Buyer order submission | 3 s | 5 s | | |
| T3 Staff confirmation | 2 s | 4 s | | |
| T4 Representative report | 5 s | 10 s | | |

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

## Results

Fill one row per task per run set.
Attach the completed table to #311 with the release SHA.
Triage each measured failure as its own issue.

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
