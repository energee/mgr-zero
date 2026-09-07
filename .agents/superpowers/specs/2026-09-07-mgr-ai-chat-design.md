# MGR — AI chat design

Goal: a staff member or portal customer can read and write anything the
application does through chat, and nothing the model says can change state
without a human clicking the verb. Written 2026-09-07; consolidates the AI
material formerly spread over the UI layout plan §2 ("Proposal safety"),
`.agents/ARCHITECTURE.md` (pre-implementation gate), and the slice 1C plan.
Plan: `.agents/superpowers/plans/2026-09-07-ai-chat.md`.

## 1. One rule

The language layer is a **client of the registry**, not a privilege tier. It
holds the caller's `Ctx`, sees only `aiExposed` operations the caller's role can
run, and emits `{ name, input }` candidates. The server previews; the human
commits. Everything below follows from that.

Corollaries:

- Chat scope is exactly `listTools({ aiOnly: true })` filtered by role. There
  is no chat-only shortcut; "anything" is reached by registering commands, not
  by widening the model's access. `/docs/api` already reports the gap
  (`available` vs `designed`).
- A `customer` ctx sees only `portal_*` operations.
- Never tagged: fail-closed commands (`import_csv`, `invite_*`), flow
  plumbing that only a UI step can call correctly (`consume_chat_link_proof`,
  `unlink_chat_user`), and `preview_command` itself. Everything else registered
  is tagged; the live list is `/docs/api`, never a hand-kept table here.
- Forms stay first-class. Model outage, rate cap, or timeout degrades to the
  form; it never blocks the write path.

## 2. Registry contract (what a command must declare to be AI-exposed)

`defineCommand` / `defineQuery` gain these fields; a test fails on any write
command missing one, and a write without a `preview` hook cannot be tagged.

| Field | Meaning |
|---|---|
| `aiExposed` | Default false. Explicit on every definition. |
| `risk` | `mutable`, `append_only`, `immutable`, `filed`, `external`, or `destructive_local`; drives review color, never permission. |
| `requiresConfirmation` | True for every AI-targeted mutation; false for queries. |
| `preview` | Server-canonical effects and warnings. Required for AI writes. Never invents document numbers — `ORD-`, `INV-`, `PO-`, `B-`, run numbers read "assigned on commit". |
| `compensation` | Exact registered command or named workflow, or null when no lawful automatic correction exists. There is no generic Undo. |
| `idempotency` | `dedupe` or `online_only`; every mutation carries a stable `requestId`. |
| `offlineReplay` | True only once `requestId` reaches client → endpoint → handler/RPC → durable dedupe. |
| `atomicity` | `single_row`, one `rpc`, `atomic_exempt_csv`, or a durable external-intent workflow. |

## 3. Preview → commit

`preview_command` is an internal registered query, **not** AI-exposed. Input
`{ command, input }`. It runs `safeParse`, the role check, and the target's
`preview` hook; it never calls the handler. Output: canonical fields, exact
effects, warnings, `allowed`, and a **version token** over the canonical
command, its parsed input, its effects, and the rows the preview read — the
token names the exact proposal the human saw, not only the state it read.

Commit sends the target command, the same `requestId`, and the token.
`/api/command` re-reads authoritative rows and rejects a stale token, or a
token minted for a different command or input. A chat-originated commit
(`origin = 'chat'`, §5) without a token is rejected outright; only forms may
commit unpreviewed. A visual
proposal is never evidence that a write is still valid.

The proposal card renders **only** `preview_command` output. Model text is
shown as conversation, never as the thing being confirmed. This is the
prompt-injection defense: tenant data (customer notes, PO text, chat messages)
flows into the model, and the worst it can do is propose a candidate a human
then reads in canonical form and declines.

## 4. The loop

Chat is an agent loop, not a one-shot composer:

1. Exposed **queries** execute inside the loop under the caller's `Ctx` with
   bounded output (paginated, capped rows) so the model cannot pull a ledger.
2. Each exposed **write** halts the loop as a candidate. One candidate, one
   verb click. No batch approve, no auto-commit setting, no "do the rest".
3. After the click the loop resumes with the committed result.

Runs server-side: a streaming route under `app/api/chat/` delegates to
`lib/chat/agent.ts`; the route holds no business logic. Registry handlers are
called with the user's `Ctx`, never a service role.

Ambiguity asks a short question and produces no candidate:

- "Blew a half of Hazy" must resolve exact product + package SKU and taproom
  location; "half" may mean a half-barrel keg, half a keg, or 0.5 bbl.
- "We're out of Pils" must distinguish counted on-hand zero from subtracting
  one keg.
- "Return a keg" must distinguish beer return + credit, empty-fleet keg
  return, and deposit refund.
- "Received 40 bags of 2-row" must resolve PO/vendor, purchase-unit factor,
  counted quantity, and required lot.
- "Gravity 1.012 FV3" must resolve the open occupancy and show SG → °Plato.
- "Ship it" and "same as last week" must re-check order identity, ship-to,
  price, active SKU/package, permission, and current order state.

These are the golden eval set (`tests/ai-chat-evals.test.ts`, stubbed
client): each must yield a question, never a candidate. The model never fills
a risky blank; the server derives sign, delta, and units.

## 5. Attribution and history

- Every chat-originated commit records `origin = 'chat'` and a conversation id
  in `private.command_requests`; a write is always attributable to the person
  who clicked.
- Conversations are server-owned (`chat_conversations`, `chat_messages`,
  tenant-scoped, RLS to the author) because the loop's context is the
  history. Device-local history is retired when this lands.

## 6. Operating limits

- Model: `claude-sonnet-5` via `@anthropic-ai/sdk`; zero-data-retention
  provider terms; tenant data never in application logs.
- Per-brewery rate and cost cap; request timeout; both surface as a plain
  message with **Open as form**.
- `ANTHROPIC_API_KEY` in `.env.example` + README; absent key hides chat, not
  forms.

## 7. Surfaces

- Staff shell: composer at the bottom of Today, ⌘K on desk.
- Portal: the same component; role filtering does the rest. Buyers also get
  the brewery's upcoming schedule: `portal_schedule` (query, `customer`,
  `aiExposed`) lists planned batches as brand + expected week and nothing
  else — no volume, recipe, tank, or lot — so "what's brewing next" is
  answerable in chat and on the **Coming up** screen, where each brand taps
  through to Shop. Gated until customers can read that projection
  (`SCHEMA/RLS-GATE`: a `portal_schedule` view over `batches` with
  `brewed_on is null`, not a customer policy on the base table).
- Slack: deferred. When it ships, a Slack confirm button carries the same
  preview token to the same commit path — no second write path.
- Voice: future transport.
