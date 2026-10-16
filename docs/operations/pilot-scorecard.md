<!-- Manual business-success scorecard for the pilot (#729): defined before launch, filled during the pilot. -->
# Pilot scorecard

Status: **evaluation period agreed 2026-10-16; other values awaiting owner**. Owner: Ted. Tracks
[#729](https://github.com/energee/mgr-zero/issues/729); evidence belongs to the
release index [#311](https://github.com/energee/mgr-zero/issues/311).

This scorecard asks whether pilot staff and buyers can replace their current ordering workflow.
A passing deployment or hosted smoke is not pilot success.
Technical sign-off lives in [`release-checklist.md`](release-checklist.md).
Pilot scope (J01 ordering, J02 picked-order adjustment, J06 recovery) is Decision 1 in
[`release-readiness-2026-09-18.md`](release-readiness-2026-09-18.md).

No scorecard or runbook exists in this repository or outside it (owner, 2026-10-16).

The document has two parts.
Part A is defined and signed off before any pilot user starts; #311 lists that as a pilot blocker.
Part B is filled in during and after the pilot.

## Part A: definition (before launch)

### Roles

| Role | Responsibility | Person |
| --- | --- | --- |
| Scorecard owner | Keeps this record and makes the proceed/adjust decision | Proposal: Ted |
| Brewery lead | Pilot brewery's day-to-day contact; reports blockers | |
| Operator | Fills the operator log | Proposal: same as scorecard owner |
| Staff users | Use MGR for orders, picking, and invoices | |
| Buyers | Place orders through the portal | |

### Starting conditions

The pilot starts only when every row is true.

| Condition | Met (date) |
| --- | --- |
| Release sign-off in [`release-checklist.md`](release-checklist.md) is complete | |
| Every pilot blocker in #311 is closed | |
| Pilot brewery has locations, brands, SKUs, and price groups entered | |
| Opening inventory is recorded | |
| Staff users have accepted invitations | |
| At least one buyer per pilot customer has accepted an invitation | |
| The spreadsheet or tool being replaced is named, with its current owner | |

### Evaluation period

Agree one limit or both.
The pilot ends at the first agreed limit reached.

| Rule | Proposal | Agreed value |
| --- | --- | --- |
| Calendar period | 4 weeks from the first real order | 4 weeks from the first real order (owner, 2026-10-16) |
| Order count | 50 completed orders | Not used: the calendar period alone ends the pilot |

### Outcome measures

Record every measure by hand in the operator log below.
No analytics package is needed.
The owner accepts or changes each proposed target.

| # | Measure | How it is counted | Proposed target | Agreed target |
| --- | --- | --- | --- | --- |
| M1 | Setup to first completed order | Days from the first staff sign-in to the first order invoiced | 7 days or fewer | |
| M2 | Independent orders | Share of orders placed and completed with no help from the operator | 80% by the final week | |
| M3 | Assisted orders | Orders where the operator stepped in; note why | Falls week over week | |
| M4 | Stock reconciliation exceptions | Weekly count where MGR stock differs from a physical count | 0 unexplained at period end | |
| M5 | Invoice reconciliation exceptions | Invoices whose MGR amount differs from QuickBooks or the customer's record | 0 unexplained at period end | |
| M6 | Remaining spreadsheet work | Tasks staff still do in the old spreadsheet; list each one | None for pilot-scope journeys | |

Definition signed off by: ____________ Date: ____________

## Part B: evaluation (during and after the pilot)

### Operator log

Add one row per event.
An event is an order, an assist, an exception, or a spreadsheet task.

| Date | Order or record | Event | Measure | Independent or assisted | What happened | Follow-up issue |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

### Weekly summary

| Week ending | Orders completed | Independent | Assisted | Stock exceptions | Invoice exceptions | Spreadsheet tasks left |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| | | | | | | |

### Decision record

Record one decision at the end of the evaluation period.

| Field | Value |
| --- | --- |
| Date | |
| Release SHA in use | |
| Measures met | |
| Measures missed, with reason | |
| Decision | Proceed, or adjust |
| If adjust: what changes and the next review date | |
| Decided by | |

Attach the completed Part B to #311.
Triage each product failure it finds as its own issue.
