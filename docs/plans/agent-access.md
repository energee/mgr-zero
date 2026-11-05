# Outside agents use MGR (agent access)

Status: approved by the owner, 2026-11-04. Tracked in #1766. Paths and counts
were checked against `main` at `40278052a`.

## Goal

1. **Connect.** Any agent a staff member brings connects to MGR in minutes,
   acts as that person, and can never exceed that person's roles. "Any agent"
   means Claude, ChatGPT, Cursor, VS Code, an AI SDK app, the OpenAI Agents
   SDK, or a script.
2. **Understand.** One call tells the agent what MGR is, who it acts for, what
   it can do, and which actions wait for a human.
3. **Learn from it.** Every agent session leaves a structured record. The
   failures and gaps across sessions reach the development harness as a
   weekly GitHub issue that holds counts and names only, never tenant data
   and never agent-written text.

## What exists and is reused (Negative 2)

| Need | Already built |
| --- | --- |
| One governed entry point | `lib/commands/registry.ts` and `app/api/command/route.ts` (iron rule 1). About 175 commands and 135 queries. |
| Tools for a model | `listTools({ aiOnly: true, ctx })`; `createComposerTools` in `lib/chat/agent.ts`; `boundToolResult`. 10 definitions are `aiExposed` today. |
| Authorization | Security definer RPCs and RLS (iron rules 3 and 5). They apply to any token the caller holds. |
| Replay and audit of writes | `private.command_requests`: actor, request id, command, payload hash, result, `origin`, preview token. Pruned after 90 days. |
| Human approval of AI writes | `preview_command` plus a version token, stale revalidation at commit, and a card that renders only server output. Only `record_inventory_movement` takes an origin today. |
| Rate limits | `consumeAdmission` (one budget per user). |
| Generated API reference | `lib/mgr/api-operations.ts`, `lib/mgr/api-schema.ts`, `bun run docs:api`. |
| Findings issue from a job | `scripts/file-doc-findings.sh`: fixed title, at most 20 findings, `@` defused. |

## Principles

- **One registry, two transports.** MCP and `/api/command` both serve
  `listTools`. Neither holds business logic.
- **The plainest client must work.** Approval, sessions and errors must work
  in an MCP client with no elicitation, no Tasks and no MCP Apps. Those
  features are enhancements.
- **An agent never approves its own proposal.** Approval comes from a human
  session on a surface MGR serves.
- **Agent text is untrusted everywhere.** It never becomes an instruction to
  Ask MGR, to another agent, or to the development harness.
- **Tenant data leaves only by the user's choice.** The consent screen says
  that the agent's model will read brewery data. Nothing tenant-specific
  reaches GitHub.

## Owner decisions (recommended default first)

- **Q1 Authorization server.** Supabase Auth's OAuth 2.1 server. Its MCP guide
  says existing RLS policies apply to MCP clients, the app must build its own
  consent page, and Dynamic Client Registration is an optional switch. The
  guide does not mention Client ID Metadata Documents (CIMD), which the
  2026-07-28 MCP spec now prefers. Default: DCR on, consent required for every
  client, and CIMD added when Supabase ships it.
- **Q2 Who may connect.** Off per brewery until an Admin turns it on. Each
  person then consents per agent.
- **Q3 What a token may do.** An agent token reads and proposes. It never
  commits, though a preview may write its own preview token. A person's own
  session commits. Supabase scopes cannot enforce this:
  its token guide says scopes "do not control access to your database tables
  or API endpoints". MGR defines no scopes and gates on the `client_id` claim
  instead (Phase 1).
- **Q4 What agents see.** The role-filtered `aiExposed` set. Grow reads by
  marking more queries `aiExposed`, in batches chosen from Phase 5 data.
  Writes grow only by adding preview contracts.
- **Q5 Approval surface.** An inbox on Today first. Slack waits for the
  trust and replay gates in `.agents/MEMORY.md`.
- **Q6 Retention.** 90 days for sessions, steps and proposals, matching
  `prune_command_requests`.
- **Q7 Harness destination.** One `Agent friction` issue, rewritten weekly.
- **Q8 Dependencies (approved).** `mcp-handler` 2.x and its required peer
  `@modelcontextprotocol/server` 2.x. Phase 2's contract test must prove it
  serves the 2025 protocol and 2026-07-28 from one endpoint.
- **Q9 Limits.** Keep the per-user budget. Add a per-client budget only if
  Phase 5 shows one client crowding out a person's own use.

## Phases

Each phase is one PR to `main` with tests first (operating loop step 3).
Phases 1 and 2 ship together if review allows, so reads and session data
start on day one.

### Phase 1 — Agent identity and the write guard

An OAuth access token is an ordinary Supabase JWT with `role: authenticated`.
Without guards it could call `/api/command` or any granted RPC directly and
commit with no approval. It could also call Supabase Auth, set the person's
password, and sign in as them. The guards live in the database and in an Auth
hook, so they hold for a token sent straight to Supabase.

**Test first:** a token issued through the real OAuth flow resolves to the
same roles as that person's session and carries the client id. That token
cannot commit, through `/api/command` or by calling an RPC directly. It cannot
change the account through Supabase Auth, before or after a refresh. In a
brewery with agents off, it reads no rows, even straight from the REST API.
A revoked grant stops working at once.

**Modify:**
- New migration:
  - `breweries.agents_enabled boolean not null default false`.
  - `private.agent_access_token_hook`, a custom access token hook. It moves the
    real `session_id` to `agent_session_id` and sets `session_id` to a random
    UUID. Auth then answers `session_not_found` on its account endpoints, and
    PostgREST never checks. `secure_password_change` does not help: a new
    agent session counts as recent.
  - `public.agent_session_is_live`, because revoke deletes the session but the
    token keeps a valid signature until `exp`.
  - `private.refuse_agent_token`, a statement trigger. It fires on insert or
    update of `private.command_requests`, which also covers the retry path in
    `begin_qbo_invoice_sync`, and on `private.invite_requests` and
    `public.notification_occurrences`, which are written outside the ledger.
  - `private.request_scope_allows` denies an agent token for a brewery with
    agents off or a dead session. The RLS helpers and `private.assert_staff`
    call it.
  - `private.assert_order_staff` now calls that check too.
    `public.list_my_invitations` returns nothing to an agent, and
    `public.consume_command_admission` refuses a dead agent session.
- A test that lists the volatile functions `authenticated` can run with no
  ledger claim, so a new one fails until someone reviews it.
- `lib/commands/context.ts`: `buildContextFromBearer` reads `client_id`, checks
  the session is live, and sets `ctx.agent`.
- `lib/auth/request-context.ts`: an agent token in a cookie is not signed in.
- `lib/commands/registry.ts`: an agent context runs only `aiExposed` queries.
- `supabase/config.toml` and `tests/supabase/supabase/config.toml`: enable the
  OAuth server and the hook locally. Hosted is ask-first.
- New consent page at `/oauth/consent`: client name, publisher domain, the
  brewery, a plain statement that the agent's model will read brewery data,
  and Deny. It must call `getAuthorizationDetails` before approving.
- `app/(app)/settings/`: an Admin switch to allow agents, and a Connected
  agents list where each person sees and revokes their grants.

**Acceptance:** an agent cannot exceed its person's roles, cannot commit,
cannot change the account, and cannot read a brewery that has agents off.

### Phase 2 — MCP endpoint and orientation

**Test first:** a contract test drives the local route with the official MCP
SDK client, under both protocol versions. It lists tools per role, calls a
query, gets a structured error, and reads the orientation result.

**Modify:**
- New `app/api/mcp/` route (thin, like `app/api/chat/`).
- Extract one registry-to-tool adapter from `createComposerTools` that both
  Ask MGR and MCP call. A second copy is a defect.
- `/.well-known/oauth-protected-resource` for MCP auth discovery.
- Server `instructions`, kept under 300 words: what MGR is, volumes are
  stored in bbl, the inventory ledger is append-only and corrections are
  compensating commands, writes are proposals a person approves, and call
  `get_started` first.
- New `get_started` query (`aiExposed`). It returns who the agent acts for
  (person, brewery, roles, timezone), its tools grouped by area with the ones
  that need approval marked, `get_today`'s items, links to `/docs`, and a
  `conversationId` the agent sends back on later calls.
- Tool annotations: map `risk` to `readOnlyHint` and `destructiveHint` as
  hints only. Safety never depends on them.
- Errors: `CommandError` code, message, and the failing input path, so a
  model can correct and retry.
- `/llms.txt` for `/docs`; `fumadocs-core` ships a `remark-llms` plugin to
  check first.
- The Phase 4 step recorder, wrapped around every MCP tool call.

**Acceptance:** a fresh agent with no prior knowledge answers "what's on
today and what's below par at the taproom?" in two tool calls.

### Phase 3 — Proposals approved out of band

**Test first:** an agent's proposal can be approved only by a cookie session
(a bearer approval returns 403); a stale proposal fails at commit and is
marked `stale`; an expired one cannot be approved; a double approval commits
once.

**Modify:**
- New migration: allow `'agent'` in `command_requests_origin_check`, add
  `agent_client_id text`, and let `record_inventory_movement` accept
  `p_origin = 'agent'` with the same preview-token rule as `'chat'`. The
  commit runs on the approver's session, so the guard in Phase 1 still holds.
- `lib/commands/registry.ts`: `CommandOrigin` gains `"agent"`; the chat
  preview rule applies to it.
- New migration: `agent_proposals` (tenant, RLS): actor, client, command,
  canonical input, preview, preview token, status (`pending`, `approved`,
  `declined`, `expired`, `committed`, `stale`), approver, request id,
  created and expiry times.
- An agent write runs `preview_command`, stores the proposal, and returns
  `{ status: "awaiting_approval", proposalId, approveUrl, expiresAt }`.
- New `get_proposal_status` query (`aiExposed`).
- Today inbox card that renders only the stored preview. Approve commits
  through the existing path with `origin = 'agent'` and the preview token.
- Enhancements: wrap a proposal in an MCP Task where the client supports
  Tasks; offer `approveUrl` through URL-mode elicitation where supported.

**Acceptance:** the full round trip works in a client that supports none of
the enhancements.

### Phase 4 — Session log and notes

**Test first:** steps record tool, kind and outcome without input or output
values; a recorder failure is logged and counted, never silent; a `leave_note`
over the length cap is rejected.

**Modify:**
- New migration: `agent_sessions` (brewery, actor, client, origin,
  conversation id, first and last seen) and `agent_session_steps` (tool,
  kind, outcome, error code, failing input path, proposal or request id,
  duration). No values, because query results are tenant data.
- Session grouping: the `conversationId` from `get_started` when the agent
  sends it, otherwise grant plus person plus a 30-minute idle window. The
  2026-07-28 spec removed `Mcp-Session-Id`, so MGR keeps its own.
- One `recordAgentStep`, called by the MCP adapter and by Ask MGR through
  AI SDK 7's `onToolExecutionEnd` with `runtimeContext`. The SDK catches
  callback errors itself, so the recorder must log its own (Negative 5).
- `leave_note` tool: kind `friction` or `handoff`, 500 characters. Stored
  as untrusted text and always shown labelled with the client.
- `list_agent_sessions` query (`aiExposed`) and an Admin Agent activity page
  over sessions, steps and the `command_requests` they caused.
- Session notes stay deterministic: built from steps. A model-written
  summary waits until someone asks for it (Negative 1).

### Phase 5 — Feedback into the development harness

**Test first:** the weekly report contains only tool names, error codes,
input paths, client names and counts. A fixture containing a customer name or
a `leave_note` text fails the test.

**Modify:**
- New service-only RPC `agent_friction_report`, called by a scheduled job
  under `app/api/` with job auth like `lib/jobs/auth.ts`.
- Per tool: calls, error codes, the input paths that fail validation most,
  proposals declined, stale and expired, and approval wait time.
- Per client: sessions, and which tools it never reaches.
- The job writes `findings.jsonl` and a script modeled on
  `scripts/file-doc-findings.sh` rewrites one `Agent friction` issue. The
  dreaming workflow reads it like the docs-gaps issues.
- `leave_note` text is never exported. It may hold tenant data, and it is a
  prompt-injection path into the coding agents. Ted reads it on an internal
  operator page and files an issue by hand when it matters.
- Lolev, with its own consent, supplies anonymized failing sequences as
  cases for the planned `tests/ai-chat-evals.test.ts`.

**What the harness does with it:** a high `invalid_request` rate on one
input path means the tool description or schema needs work. A frequent
`leave_note` theme or an unreachable task means a query to mark
`aiExposed`. A frequently declined or stale proposal means its preview
needs a clearer effect.

### Phase 6 — Guides and release check

- Staff guide: a "Connect your agent" page with consent, scopes, approvals
  and revoking.
- `content/docs/api/`: the MCP endpoint and its auth.
- Before hosted release, run the matrix by hand: MCP Inspector, Claude,
  ChatGPT, Cursor, VS Code, an AI SDK client, the OpenAI Agents SDK.

## Out of scope

- A scope that commits without a person.
- Enterprise-Managed Authorization (Okta/Entra). Revisit for a multi-site
  customer.
- Agent-to-agent (A2A).
- Shared agent memory, Mem0 and similar providers: durable facts belong on
  records through registered commands.
- Slack approvals (Q5).

## Risks

- Supabase's OAuth server may lag the spec on CIMD. DCR covers clients
  meanwhile.
- MCP spec churn: two protocol versions run side by side for at least a
  year.
- An agent's model reads tenant data under its own provider's terms. The
  consent page states this, and Admins can turn agents off.
- Only `record_movement` can be proposed today. Agents start mostly
  read-only until more preview contracts land.
- A token sent straight to the Supabase API can read anything its person's
  roles can read, not only the `aiExposed` set. Q4 holds on MGR's own
  surfaces; the person's roles are the hard ceiling.
- A revoked grant's access token keeps a valid signature until `exp`
  (`jwt_expiry` is 3600 seconds). MGR checks the session instead, which is one
  extra RPC per agent request.
- The hook rests on how Auth loads a token's session, not on a documented
  promise. `tests/agent-access.test.ts` pins it, but only against the local Auth
  image. Re-run that test whenever Auth is upgraded.
- If the hook errors, every sign-in fails, not only agents'. It touches only the
  JSON to keep that unlikely. Local stacks need the migration before they start
  with the hook on.
- Hosted order matters: apply the migration, turn the hook on, confirm the test
  against hosted, and only then turn the OAuth server on. With the OAuth server
  on and the hook off, the account takeover is open. The reads fail closed.
- The project must use asymmetric signing keys. With HS256, `getClaims` falls
  back to Auth, which refuses an agent token, so agents could not connect.
