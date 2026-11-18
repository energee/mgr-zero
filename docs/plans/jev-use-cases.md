# Jev use cases in MGR

Status: proposal for the owner. No code, schema or product change. Each use
case needs its own experiment and owner approval before any build.

## Why and scope

Staff write free text that MGR's code cannot read: order notes, cellar notes,
receipt notes, buyer questions. Sometimes that text holds a request or a
problem that no field shows. This plan lists where Jev (the repo's experiments
ran `jev-1.14.0`) could point staff at such text. It ranks the cases and names
the smallest experiment for each.

Out of scope: building anything, choosing a provider contract, and Ask MGR's
chat model (Ask MGR is a tool-using agent on the AI Gateway, a different job).

## The governing rule

The rule comes from `docs/plans/production-attention.md` (#1571) and
`.agents/MEMORY.md` ("Production attention is a proposal only"). Every use case
here must follow it.

- Code owns facts, missing inputs, blockers, authorization and navigation.
- Jev only flags a *possible* concern. Each flag quotes the source text
  verbatim and uses a fixed label. Jev does not write explanations.
- Staff dispose of a flag: **Not an issue**, **Snooze** or **Resolve**. That
  changes the flag only. It never changes an order, batch, count or report.
- A disposition attaches to the source version, so an unchanged note does not
  come back, and an edited note is reviewed again.
- A Jev failure is shown. It never hides a deterministic item.
- Experiments run offline on synthetic cases first. Real brewery text is sent
  only with explicit permission.

## Where Jev exists today

| What | Where | State |
| --- | --- | --- |
| Production-attention experiment | `scripts/experiment-production-attention.ts`, cases in `scripts/production-attention-cases.json`, CLI test `tests/production-attention-experiment.test.ts`; plan `docs/plans/production-attention.md`; PR #1571 (merged 2026-10-28) | One live run: 48 requests on 24 synthetic cases. No hidden concern and no unsafe resolve in either formulation. Not in the product. |
| Agent-eval judge | `docs/plans/agent-access.md` Group D task 11: "Code scores facts. Jev scores open answers against fixed labels." `lib/mgr/agent-eval-score.ts` returns `needs_judge` and has `applyJudgement`; runner from PR #1792 | The judge hook exists. No Jev call is wired to it. `--live` refuses until model credits are decided (#329). |

Jev runs nowhere in the product. The only Jev client is inline in the
experiment script: a `fetch` to the TypeSafe `systemone` endpoint, Zod response
schemas, `--dry-run` and `--live`, and each case run with normal and reversed
criteria. `TYPESAFE_API_KEY` is its only credential.

## Candidate use cases

Each row reads text that already exists in MGR. Columns: **Det.** is what stays
deterministic; **If wrong** is the cost of a false alarm (FA) or a miss.

| # | Area | User | Text Jev reads | Jev outputs | Det. | If wrong | Value | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Production follow-ups | Production manager | Fermentation and packaging notes (`fermentation_readings.note`, `packaging_runs.note`) | Open / resolved / no action / uncertain, with the supporting note | Blockers, missing inputs, readings, eligibility | FA: one dismiss. Miss: same as today, where staff read the notes. | H | L |
| 2 | Order notes | Sales, Admin confirming an order | `orders.note` (staff or portal buyer), with the order's line names as context | "Note may ask for something the lines don't show", with the quote | Lines, quantities, prices, ATP, confirm | FA: one dismiss. Miss: same as today. | H | L |
| 3 | Receipt and PO notes | Purchasing | `receipts.note`, `purchase_orders.note` | "Note may report damage, a short or a substitution", with the quote | Received quantities, lots, costs, QuickBooks Bill | FA: one dismiss. Miss: a vendor credit goes unasked, as today. | M | L |
| 4 | Release allocation notes (**depends on the unmerged plan** below) | Sales, Admin setting allocations | That customer's recent order notes | "Possible closure", "Asks for more of a brand", with the quote, beside the customer's allocation row | Every allocation number, the 90-day same-format share, rounding, the pool, any ordering drop-off | FA: one dismiss. Miss: same as today. | M | L |
| 5 | Cellar loss notes | Cellar, Admin | `volume_adjustments.note` beside its chosen `reason` | "Note may not match the chosen reason", with the quote | Barrels, reason, removal class, tax treatment, TTB report | FA: one dismiss. Miss: a wrong category stays, as today. | M | M |
| 6 | Invoice questions | Admin, Sales | `invoice_questions.body` (buyer, from the portal) | One fixed topic: pricing, short or missing item, keg deposit, payment, other | Invoice totals, payments, `resolve_invoice_question` | FA or miss: a question sorts under the wrong topic; it is still listed. | L–M | L |
| 7 | Refused delivery notes | Warehouse, Production manager | The refusal note on `confirm_delivery` (reason is already a fixed enum) | "Note may describe a quality problem", with the quote | Refused quantities, reorder draft, stock | FA: one dismiss. Miss: same as today. | M | L |
| 8 | Import name matches | Admin | A CSV or Lolev name that matched nothing, and the existing names | "Possible existing record", both names quoted | Exact matching, every row commit | A wrong pick merges two records. Staff must confirm each one. | M (onboarding only) | M |
| 9 | COLA pick | Admin | TTB fanciful names when they repeat (`docs/plans/cola-search.md`) | "Possible match" for the brand | The TTB ID, serial and date fill; staff pick | Wrong pick fills the wrong COLA. Staff already pick by hand. | L | M |

Use case 4 comes from the portal release windows plan
(`docs/plans/portal-release-windows.md`, commit `47731444d` on branch
`energee/customer-portal`, not on `main`). That plan suggests each customer's
allocation from 90-day same-format shipped history. Jev never changes a number
there. An ordering drop-off is arithmetic, so code owns it, not Jev.

Text that MGR does not hold is not a use case yet. MGR sends order email but
receives none (`docs/operations/order-email-worker.md`). It stores no vendor
invoice documents and no customer-level notes. Reading those would first need
an ingestion path, which this plan does not propose.

## Rejected, and why

| Idea | Why not |
| --- | --- |
| Jev suggests allocation numbers or demand | Numbers must be explainable and reproducible. Production attention also excludes demand forecasting. |
| Jev computes TTB quantities, tax treatment or removal class | Compliance arithmetic and classification are code and staff decisions. Use case 5 only points at a note. |
| Jev prices lines, sums invoices or matches payments | Money is deterministic. |
| Jev auto-closes a concern or completes a task | The experiment showed no unsafe resolves on 24 cases. That is not permission to close work. |
| Jev drafts and sends a buyer or vendor reply | It writes without staff confirmation and generates explanations. |
| Jev decides who sees an item or where a link goes | Authorization and navigation belong to the registry and roles. |
| Jev replaces Ask MGR's model | Ask MGR calls tools on the AI Gateway. The trialed Jev questions were choices over given text. |
| Jev reads label images | The experiment sent text only. Image input was not trialed. |

## Shortlist

Ranked by value over risk, then by how much already exists.

### 1. Production follow-ups (use case 1)

- **Experiment:** the "Next experiment" in `production-attention.md`. Freeze the
  questions. Build a brewer-reviewed holdout with terse shorthand, several
  concerns per history, and reopened work. Add same-order repeats as a control.
- **Pass bar:** zero hidden concerns and zero unsafe resolves on the holdout.
  The supporting note is correct in every flagged case.
- **Integration:** the production-attention query already proposed there,
  registered with `defineQuery` beside `lib/commands/production.ts`.

### 2. Order notes (use case 2)

- **Experiment:** 20–30 synthetic order notes with line names. Include
  requests the lines show, requests they don't, delivery instructions,
  pleasantries, negations and an injection attempt. Copy the production
  experiment's CLI shape: `--dry-run`, `--live`, normal and reversed.
- **Pass bar:** no missed "asks for more" case. At most one false alarm in ten
  no-concern cases. The quote is verbatim from the note.
- **Integration:** one query that returns flags for an order's current note
  version. The order and confirm screens show the quote with the three
  dispositions. `confirm_order` and its preview do not change.

### 3. Receipt and PO notes (use case 3)

- **Experiment:** 20 synthetic receipt notes (damaged, short, substituted,
  routine, negated). Same CLI shape and pass bar as order notes.
- **Pass bar:** as order notes.
- **Integration:** one query over receipts; the flag shows on the receipt and
  the vendor detail page. Receiving, costs and the Bill do not change.

### 4. Cellar loss notes (use case 5)

- **Experiment:** 20 synthetic adjustment notes, each paired with its chosen
  reason. Half the pairs disagree.
- **Pass bar:** stricter than the others, because it sits next to TTB data. No
  missed mismatch. At most one false alarm in ten. A brewer reviews every
  label.
- **Integration:** a flag on the adjustment row. Any correction stays a staff
  action through the existing commands (for example `reattribute_loss`). Jev
  never proposes the new reason.

### 5. Release allocation notes (use case 4)

- **Blocked:** the release windows plan must merge first.
- **Experiment:** 20 synthetic per-customer note histories (closures, "more of
  X", unrelated chatter, old closures already past).
- **Pass bar:** as order notes. A closure flag quotes the dates; code compares
  the dates, not Jev.
- **Integration:** one query keyed by release and customer, read beside
  `suggest_release_allotments`. It never feeds that RPC.

## Shared plumbing

What exists, reused first:

- **Experiment pattern:** `scripts/experiment-production-attention.ts` with its
  JSON cases and CLI test. Each new experiment follows its shape.
- **Judge scoring:** `lib/mgr/agent-eval-score.ts` (`needs_judge`,
  `applyJudgement`) for the agent evals.
- **Query boundary:** `defineQuery` and roles in `lib/commands/registry.ts`.
  UI, `/api/command`, MCP and Ask MGR read the same operation.
- **Attention vocabulary:** `TodayItem` in `lib/commands/today.ts` (reason,
  subject, source version, link, due, roles). Chat notifications project Today,
  so a flag that reaches Today can reach Slack with no new delivery code.

What is missing:

- **A shared Jev client.** The request and response schemas live inside one
  script. The second experiment is the time to move them into one `lib` module
  with two callers. Copying them would be a second copy (Negative 2).
- **A store for flags and dispositions.** `production-attention.md` describes
  it (key: brewery, subject, source version, reason; RLS; tenant-composite
  references). It is not built. Build it once, for production attention, and
  reuse it. Do not reuse `snooze_notification` or Slack delivery state; that
  plan says so too.
- **A visible provider-failure state** for flags. Ask MGR has one
  (`lib/chat/provider-failure.ts`); its fit for flags is unchecked.
- **Permission to send real text.** Every case here needs owner approval and a
  look at TypeSafe's data terms before real notes are sent.

## Open questions for the owner

1. Is production attention still first, with order notes second?
2. May minimized real notes go to TypeSafe for a holdout, and which areas?
3. Should open and uncertain show as one "needs a look" state, as
   `production-attention.md` suggests?
4. For use case 4: should allocation flags read only order notes, or also
   refusal notes?
5. Is use case 5 worth the risk of sitting next to TTB data, or should it wait?
6. Who pays for live runs, and is it the same decision as the model credits in
   #329?
