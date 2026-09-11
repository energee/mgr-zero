# Composer: complete application chat with AI SDK

Status: proposed implementation plan. No implementation authorized by this document alone.

Target: PR #315, `fix/composer-chat-interface`, worktree
`.agents/worktrees/composer`, PR base `main`.

## Outcome and decisions

Make MGR's composer a polished, conversational way to operate the application:
ask questions, find records, resolve ambiguity, review changes, execute an
explicitly confirmed action, and continue with its actual result.

Decisions from Ted:

- Use Vercel AI SDK Core and Vercel AI Gateway.
- Adding `ai` and `@ai-sdk/react` is approved. Gateway is provided by `ai`;
  a direct Anthropic/OpenAI adapter is unnecessary.
- Delete deprecated composer logic. Ship one conversational path, without
  the keyword router or a parallel no-model command-picker implementation.
- Write the plan first; do not continue implementation yet.

The final target is application coverage, not just an inventory chatbot.
A first vertical slice is a checkpoint, not completion of this plan.

## Verified starting point

- `components/mgr/composer.tsx` currently routes a few keywords into ATP
  reads or a movement questionnaire. It has no model connection or continuous
  conversational transcript.
- `lib/commands/registry.ts` already owns validation, roles, `aiExposed`,
  preview hooks, confirmation requirements, and command execution.
- Only `record_movement` currently declares `aiExposed: true`. Its server
  preview and idempotent commit are already implemented. The existing ATP
  fallback invokes ordinary queries; those queries are not yet AI tools.
- `lib/commands/preview.ts` currently accepts only `record_movement` for
  `preview_command`. It also registers server-owned conversation/history
  operations, restricted to staff. Messages contain text and recorded results;
  they do not yet provide a complete SDK message-parts persistence contract.
- The shell remounts the composer when actor, brewery, or role changes.
- The offline outbox is active functionality for exact fermentation readings.
  It is not deprecated and must survive the composer replacement.
- Explorer and live surfaces already share parts of
  `components/mgr/views/composer.tsx`; complete conversation composition still
  needs one shared owner.

This plan replaces the direct-Anthropic and no-model delivery choices in the
September 7 AI chat and Program 15 plans. Their authorization, canonical
preview, idempotency, and domain safety requirements remain applicable.
The Program 15 claim that history is device-local is stale; preserve the
server-owned history that actually exists.

## Experience contract

Use the existing MGR typography, colors, spacing, controls, and responsive
shell. The signature interaction is a useful answer followed by an exact,
readable review card when a change is proposed.

- **Entry:** a compact composer stays reachable from staff screens. Typing
  or Command/Ctrl-K opens the conversation without losing the current page.
  Suggestions reflect the person's role and current area.
- **Conversation:** retain prior turns, understand follow-ups, and resolve
  references such as “that order” against identified records. Current page
  context is a hint, never authorization or a substitute for reading a record.
- **Answers:** readable paragraphs/lists, appropriate small tables, exact
  units and package labels, observation times, and links to source records.
  Use existing shared record views where they fit. No arbitrary model HTML.
- **Clarification:** ask the next useful question. Offer real entity choices
  when several records match; selections become conversation input. Avoid
  forcing people through a field-by-field form when their message already
  supplies the required facts.
- **Review:** show server-canonical fields, effects, warnings, and the actual
  verb, such as Confirm order or Record movement. Offer Edit, Dismiss, and
  Open as form where the workflow supports them. Editing requires a new
  preview. Keep the assistant's explanation separate from the confirmed data.
- **Completion:** show a receipt and relevant next actions; refresh affected
  application data and continue the conversation using the recorded result.
- **Controls:** Send, Stop response, New chat, History, Continue conversation,
  Minimize, and visible recovery actions. Enter sends; Shift-Enter inserts a
  newline; IME composition never submits. Input grows to a bounded height.
- **Scrolling:** follow new output only while the person is near the bottom.
  Reading older messages must not jump to the latest token; offer a jump-to-new
  control when new content arrives below the viewport.
- **Mobile/accessibility:** composer and review controls remain usable with
  the on-screen keyboard; no horizontal overflow at 360px. Preserve focus,
  keyboard navigation, touch targets, reduced motion, and useful announcements
  without announcing every streamed token.
- **Unavailable:** say chat is unavailable and provide relevant application
  destinations. Ordinary forms remain usable. Do not revive the keyword
  fallback or label disconnected AI as working chat.

## Architecture

```text
Staff / portal adapter → shared conversation surface ← explorer fixtures
          │
     useChat + SDK transport
          │
     /api/chat → authenticated conversation service → AI Gateway
          │                      │
  server-owned history     role-filtered registry tools
                                 ├─ query → bounded result → conversation
                                 └─ candidate → internal preview → review card
                                                                      │
                                                           explicit verb click
                                                                      │
                                  /api/command → transactional revalidation
                                               → recorded result → conversation
```

Use SDK streaming, message state, tool schemas, and transport primitives.
Do not introduce a second agent framework, provider abstraction, custom SSE
parser, or duplicate command registry. Read the installed SDK and Next.js
guides before implementation; API names must match the selected versions.

The model never holds a service-role client or executes a domain write.
Only exposed, permitted queries execute in the loop. Write tools produce a
candidate; internal registry preview creates the reviewable proposal. SDK
tool approval UI alone cannot replace MGR's canonical preview/token contract.

## Implementation sequence

### 1. Map coverage and replace stale design instructions

- [ ] Trace every shipped screen action to its registered operation and role.
  Reconcile this against the registry and generated API documentation in both
  directions; include dialogs, correction flows, and portal actions.
- [ ] Record each operation as read-ready, preview-ready, needs preview,
  needs backend work, or intentionally UI-only, with its owner and reason.
  Derive permissions and schemas from the registry, not a hand-maintained copy.
- [ ] Identify UI-only boundaries: authentication/OAuth, file import steps,
  invitation plumbing, and any operation explicitly excluded by the existing
  security contract. Reach their real UI from chat; never expose internal
  plumbing as a workaround.
- [ ] Amend the existing AI design/implementation documents to point to this
  plan and remove contradictory instructions. Do not edit shared progress,
  memory, or drift logs in the feature PR.

Exit: a reviewable coverage map and explicit exceptions. “All app operations”
must not mean “all operations already tagged AI-exposed.”

### 2. Build the shared conversation surface

Owners: `components/mgr/views/composer.tsx`, `components/mgr/composer.tsx`,
`components/mgr/screens.tsx`, `components/mgr/e.tsx`, screen-frame/explorer
composition, and staff/portal shell adapters as needed.

- [ ] Implement the experience contract with controlled messages, status,
  choices, proposals, receipts, and callbacks. Presentation has no DB/model
  calls and imports no fixture identities into live code.
- [ ] Draw explorer states for empty, reading, streaming, clarification,
  review, committed, stopped, disconnected, retry, stale preview, denied,
  history, and an uncertain write outcome. Use local simulated events only.
- [ ] Keep the same surface, header, transcript, input, and action views in
  explorer and live composition. Inventory destinations remain inert or
  inside the explorer unless explicitly supplied.
- [ ] Isolate the existing outbox UI/controller only as needed to preserve
  it through replacement. Do not expand offline eligibility.

Exit: the whole conversation is reviewable in the explorer at desktop and
mobile sizes, with shared component composition proven from code.

### 3. Connect Gateway and durable conversation state

Owners: `app/api/chat/route.ts`, a composer service under `lib/chat/`,
`lib/composer/` message contracts, existing conversation commands, server env
configuration, `.env.example`, and `README.md`.

- [ ] Install compatible `ai` / `@ai-sdk/react` versions and lock them.
  Configure Gateway authentication server-side; never expose credentials.
  Make the Gateway model ID server-configurable and validate its required
  capabilities. Do not hard-code an unverified model identifier.
- [ ] Implement a thin streaming route and use SDK transport/useChat on the
  client. Reuse the command request's bounded-body and context checks.
- [ ] Prove conversation ownership before model use. Load authoritative
  history server-side; accept the new user turn, not client-supplied trusted
  assistant messages, tool results, previews, or receipts.
- [ ] Persist stable turn identities and validated message parts, tool
  outcomes, clarification choices, proposal status, and receipts through
  registered operations. Keep existing text history readable with a small
  read adapter; do not erase old conversations.
- [ ] Preserve turn ordering and admit one active turn per conversation.
  Retry must not duplicate the user turn; reload and Continue must recover
  context. Cancel or ignore stale streams after scope/conversation changes.
- [ ] Treat Stop as stopping generation, never reversing a submitted command.
  An interrupted answer must not become an authoritative completed answer.
- [ ] Add bounded context, tool steps/calls/results, request timeouts, and
  shared per-brewery rate/spend admission. Reserve budget atomically before
  generation and settle usage afterward. Process-local counters are not the
  completed multi-instance budget implementation.
- [ ] Log operational metadata without raw tenant prompts, results, or keys.
  Verify Gateway/provider data-handling settings against the design's privacy
  requirements before using real customer data.

Backend boundary: message-part persistence, shared admission, and any new
conversation RPC/RLS work belong to the backend phase. Under the current
screen-only focus, draw these states as gated; do not silently replace them
with localStorage or an in-memory production ledger. Follow the actual
migration history and obtain the repository-required approval for additional
migration files before creating one.

### 4. Deliver the first complete vertical slice

- [ ] Expose reviewed inventory discovery/ATP queries with the existing role
  checks. Bound data at the query boundary where possible; label incomplete
  output and support narrowing/pagination. Never calculate a “total” from a
  silently truncated result.
- [ ] Connect natural-language clarification to exact SKU/package, location,
  bin, lot or explicitly untracked stock, quantity, and movement purpose.
  Keep sign/unit derivation in domain-owned code, not the model.
- [ ] Route the candidate through existing `preview_command`; render only
  its canonical effects. Mint at most one active proposal per turn, including
  when the model emits parallel tool calls.
- [ ] Commit only from the card's explicit verb through `/api/command` with
  the same request ID, conversation, and bound preview token.
- [ ] Keep an uncertain dispatched request frozen for exact retry. Double
  clicks, lost responses, scope changes, and refresh must not drop its identity
  or start a replacement write. Never reconstruct a pending commit from model
  text. Recovery must recheck actor/tenant authorization.
- [ ] Resume the model with the server-recorded outcome after confirmation;
  do not replay the original request as if it were a new user instruction.

Exit: a person can ask about stock, resolve an ambiguity, review a movement,
commit once, and ask a follow-up in one continuous conversation.

### 5. Expand to full staff application coverage

Use the coverage map to deliver cohesive workflow batches:

| Batch | Coverage |
| --- | --- |
| Daily work and discovery | Today, record search, current work and linked destinations |
| Commercial | Customers, ship-tos, pricing, orders, confirmation, invoices and buyer questions |
| Warehouse | Inventory, bins, allocations, picks, shipping, transfers, receiving and purchasing |
| Production | Recipes, batches, brew day, cellar, readings, packaging, materials and planning |
| Taproom and fleet | Counts, taps, keg events, balances, and supported corrections |
| Administration and compliance | Catalog, locations, settings, reports, filing and integration workflows |

For each batch:

- [ ] Review which reads may leave the application through Gateway; filter
  credentials/internal integration state, preserve permissions, and test
  bounded results and meaningful links.
- [ ] Add each eligible write's registry-owned canonical preview, risk,
  compensation guidance and transactional token revalidation at its owner.
  Generalize `preview_command` beyond its movement-only input once those
  contracts exist. Do not add a generic “execute arbitrary command” tool.
- [ ] Reuse the shared review card, with domain-specific content only where
  the effects require it. “Open as form” carries known fields through a
  reviewed, validated handoff; unsupported fields must not disappear silently.
- [ ] Keep compound actions in their existing atomic command. Corrections
  use the declared correction workflow; no generic Undo, batch approval, or
  automatic approval of later writes.
- [ ] Update customer guides, generated API coverage, and explorer fixtures
  in the same batch. Remove the corresponding coverage gaps.

Exit: all eligible shipped staff operations work conversationally. A link to
an ordinary form is a recovery/UI-only boundary, not a substitute for an
unimplemented chat write counted as complete.

### 6. Add the customer portal on the same implementation

- [ ] Extend server history ownership to the exact customer account context;
  no reuse of staff scope or brewery-wide customer access.
- [ ] Reuse the conversation surface and loop with only allowed `portal_*`
  operations: shopping/catalog, draft editing, submission, orders, invoices,
  questions, and applicable account workflows.
- [ ] Prove staff-only quantities, costs, tank/recipe data, other customers,
  and staff conversations cannot enter portal tools, history, or output.
- [ ] Keep designed-but-unshipped features, including upcoming production
  projections without their customer-safe query, explicitly gated.

Exit: staff and portal use one chat implementation with different authorized
data and operations, proven by role/tenant tests.

### 7. Remove legacy code and complete delivery

- [ ] Delete keyword routing, the no-model movement/ATP chooser controller,
  manual fallback answer generation, and state/helpers used only by those
  paths. Delete obsolete questionnaire views once fixtures and callers use
  the conversational choices. Preserve pure domain validation still in use.
- [ ] Replace stale tests that assert keyword behavior with tests of the
  new behavior. Preserve and strengthen preview/commit/idempotency coverage.
- [ ] Remove obsolete dependencies, imports, unreachable states, old demo
  behaviors, and claims that AI is “not connected” after it is configured.
  Delete only files exclusively owned by the deprecated composer.
- [ ] Preserve recorded conversation data, existing command contracts,
  movement form handoffs, and the fermentation outbox's exact-retry behavior.
- [ ] Confirm there is one model loop, one command execution boundary, and
  one shared conversation rendering path. No compatibility router remains.

## Required acceptance evidence

All criteria below are required for final completion; intermediate releases
must report their remaining coverage explicitly.

| ID | Scenario and trigger | Required outcome / prohibited effect | Evidence |
| --- | --- | --- | --- |
| AC-01 | Staff asks a question, then refers to the answer | Follow-up retains identified context and reads current data; no fabricated units or records | Stubbed SDK loop tests plus controlled live-model evaluation |
| AC-02 | An ambiguous brewery instruction is sent | Ask a useful question; no premature proposal or write | Golden scenarios below, exercising actual prompt/tool behavior |
| AC-03 | The model requests a write | Only a server preview appears; text or tool approval alone never executes it | Tool/route tests asserting zero writes before click |
| AC-04 | User edits, dismisses, double-clicks or confirms a stale proposal | Edited/dismissed proposals cannot commit; stale state is rejected; one confirmed effect at most | Pure state tests and isolated database integration tests |
| AC-05 | Connection is lost during a commit | Exact attempt identity survives and retry recovers its authoritative outcome; no replacement request | Transport failure and reload/recovery tests |
| AC-06 | Actor, brewery, role or customer changes | Old output clears; late responses and cross-scope history/tools are refused | Multi-context route, browser and RLS tests |
| AC-07 | Stop, retry, history or Continue is used | No duplicated user turn or side effect; durable history resumes and receipts stay distinguishable from model text | SDK transport/persistence tests and browser interaction |
| AC-08 | Gateway is absent, fails, times out or reaches its budget | Plain recovery state and usable app/form links; no keyword fallback, credential leak or unbounded loop | Provider-boundary failure tests and shared-budget concurrency tests |
| AC-09 | Same conversation state is rendered in explorer and app | Same surface and controls; readable mobile/desktop layout and keyboard/screen-reader behavior | Composition tests and rendered-page QA at 360px and desktop |
| AC-10 | Final coverage audit runs across shipped workflows | Every eligible operation is supported; each UI-only exception is named and reviewed; no deprecated routing remains | Registry-to-screen audit, docs generation and source/call-site check |

Golden scenarios from the existing design: “Blew a half of Hazy,” “We're out
of Pils,” “Return a keg,” “Received 40 bags of 2-row,” “Gravity 1.012 FV3,”
and “Ship it / same as last week.” Add complete, unambiguous counterparts so
the assistant is also tested for avoiding unnecessary questions. Merely
labeling an empty-input unit test with these phrases is not a model evaluation.

## Verification and rollout

- Use failing Vitest cases first for new logic, SDK provider-boundary stubs,
  and isolated database tests for persistence/authorization/preview changes.
  Never run destructive suites against the shared dev database.
- For each screen batch run the repository's required pure inventory tests,
  `bunx tsc --noEmit`, and `bun run lint`; use the browse skill against the
  actual worktree's dev-server port. Check both composition and appearance.
- Full fresh-database CI and Next build must pass for the pushed revision
  before declaring that release ready. Use no real model calls in CI.
- Run an explicitly approved, bounded Gateway evaluation with synthetic
  brewery data before enabling real data. Record task completion, clarification
  usefulness, incorrect proposals, latency, and cost; no invented scores.
- Roll out staff inventory first, then domain batches, then portal. Preserve
  ordinary forms throughout; rollback disables AI without resurrecting legacy
  composer code or deleting history/receipts.

The remaining deployment choices are the Gateway model ID, acceptable
per-brewery spend limits, and provider data-handling policy. They do not block
planning or fixture work; settle them before paid evaluation or deployment.
Voice, Slack chat execution, autonomous background agents, and unsolicited
actions are outside this plan.

## References

- [AI SDK Core](https://ai-sdk.dev/docs/ai-sdk-core)
- [Gateway provider and model configuration](https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway)
- [Tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [Chat UI](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot)
- [Transport](https://ai-sdk.dev/docs/ai-sdk-ui/transport)
- [Message persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)
- [Custom streamed data](https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data)
- Local constraints: `AGENTS.md`, `.agents/ARCHITECTURE.md`, the September 7
  AI chat design/plan, and Program 15. Read the installed SDK docs as the
  version-specific authority when implementing.
