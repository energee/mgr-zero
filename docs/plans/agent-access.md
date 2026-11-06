# Outside agents use MGR (agent access)

Status: approved by the owner, 2026-11-04. Q4 and Phases 2 and 3 were rewritten
at the owner's request on 2026-11-05, so that agents reach every operation with
nothing maintained twice. Tracked in #1766.

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

## Readiness scorecard

The goal is an agent that can read and write everything a person can, and
understands what it is doing. These numbers say how far away that is. Each row
is measured, not estimated. Baseline: `main`, 2026-11-05. Print the current
numbers with `bun run scripts/agent-readiness.ts`.

**Today: 0 of 15 at target.**

### Reach: can an agent get there?

| # | Measure | Today | Target | How it is measured |
| --- | --- | --- | --- | --- |
| R1 | Queries an agent can run over MCP | 0 of 137 | All but the hide list | The MCP contract test |
| R2 | Commands an agent can propose | 0 of 177 | All but the hide list | The MCP contract test |
| R3 | Clients that finish a read and a proposal | 0 of 7 | 7 of 7 | By hand, Phase 6 matrix |
| R4 | Hosted steps done: signing keys, hook, OAuth server | 0 of 3 | 3 of 3 | By hand, against hosted |

### Understanding: does it know what things mean?

| # | Measure | Today | Target | How it is measured |
| --- | --- | --- | --- | --- |
| U1 | Input field uses with a stated meaning | 41 of 916 | All | `scripts/agent-readiness.ts` |
| U2 | Operations described in 7 words or more | 301 of 314 | All | `scripts/agent-readiness.ts` |
| U3 | Core concepts explained in a public guide | 0 of 16 | 16 of 16 | Anchors in the guide |
| U4 | Lifecycles explained in a public guide | 0 of 6 | 6 of 6 | Anchors in the guide |
| U5 | Commands that say how to undo them, or that they cannot be | 1 of 177 | All | `scripts/agent-readiness.ts` |
| U6 | Command id field uses shown as names on an approval card | 0 of 334 | All | The name lookup test, task 13 |

U5 counts written text only. `compensation` defaults to `null`, which says
nothing.

### Results: does it get things right?

| # | Measure | Today | Target | How it is measured |
| --- | --- | --- | --- | --- |
| O1 | Eval tasks written | 0 | 50 | `tests/fixtures/agent-evals.json` |
| O2 | Read tasks answered correctly | Not measurable | 90% or more | `scripts/agent-evals.ts` |
| O3 | Proposals correct on the first try | Not measurable | 85% or more | `scripts/agent-evals.ts` |
| O4 | Unsafe results: a commit with no approval, or data past the person's roles | Not measurable | 0, always | `scripts/agent-evals.ts` |
| O5 | Median tool calls per task | Not measurable | 5 or fewer | `scripts/agent-evals.ts` |

O4 is a hard gate. One unsafe result blocks release, whatever the other numbers
say. The targets are proposals; set them with real results in hand.

The 16 concepts for U3: roles, brands and SKUs, formats, lots, locations and
bins, the movement ledger, reversals, batches and occupancy, volumes in bbl,
allocation and available to promise, shipping and invoice timing, price groups,
keg pools, purchase orders and receipts, compliance periods and filing, and
QuickBooks as the book of record for money.

The 6 lifecycles for U4: order, purchase order, stock transfer, allocation,
batch, and packaging run.

## What exists and is reused (Negative 2)

| Need | Already built |
| --- | --- |
| One governed entry point | `lib/commands/registry.ts` and `app/api/command/route.ts` (iron rule 1). About 175 commands and 135 queries. |
| Tools for a model | `listTools({ ctx })` and `canRun` filter by role; `boundToolResult` bounds results. All 314 operations declare a name, description, input schema and roles. |
| Authorization | Security definer RPCs and RLS (iron rules 3 and 5). They apply to any token the caller holds. |
| Replay and audit of writes | `private.command_requests`: actor, request id, command, payload hash, result, `origin`, preview token. Pruned after 90 days. |
| Human approval of AI writes | `preview_command` and its card, for `record_movement` only. Every other command has no preview hook. |
| Describing an operation's input | `lib/mgr/api-schema.ts` already builds field tables for `/docs/api`. |
| Turning an id into a name | `search_entities` in `lib/commands/search.ts` has label queries for about 16 entity types. |
| Rate limits | `consumeAdmission` (one budget per user). |
| Generated API reference | `lib/mgr/api-operations.ts`, `lib/mgr/api-schema.ts`, `bun run docs:api`. |
| Findings issue from a job | `scripts/file-doc-findings.sh`: fixed title, at most 20 findings, `@` defused. |

## Principles

- **One registry, two transports.** MCP and `/api/command` both serve
  `listTools`. Neither holds business logic.
- **A registered operation is an agent tool.** A new `defineCommand` or
  `defineQuery` reaches agents with no agent-specific work. Roles decide who may
  run it, through the same `canRun` the app uses.
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
- **Q4 What agents see (revised 2026-11-05).** Every operation the person's
  roles allow, minus a short hide list (`agentHidden` on the definition). Reads
  run directly. Writes become proposals through one generic flow, so a command
  needs no preview hook to be reachable. `aiExposed` protected nothing for reads,
  because a token can already read what its roles allow straight from Supabase.
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
- **Q10 Who approves.** Only the person the agent acts for, on their own
  session. Their roles are checked again when the command runs.
- **Q11 Proposal life.** 24 hours, then `expired`.
- **Q12 Which brewery (settled 2026-11-05).** A Supabase grant holds only the
  client, scopes and date, so it cannot store a brewery. The token reaches every
  brewery of the person's where agents are on, and the consent page lists them.
  The agent names one on each call, defaulting when the person has one. The
  Admin switch stays the database guard. A person cannot limit an agent to one of
  their breweries; add a grants table if someone asks for that.

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
  Phase 2 widens this to every query its roles allow.
- `supabase/config.toml` and `tests/supabase/supabase/config.toml`: enable the
  OAuth server and the hook locally. Hosted is ask-first.
- New consent page at `/oauth/consent`: client name, the host the sign-in goes
  to, the breweries it can reach, a plain statement that the agent's model will
  read brewery data, and Deny. A client chooses its own name, so the host is what
  a person can trust. It must call `getAuthorizationDetails` before approving.
- `set_brewery_agents_enabled`: an Admin switch in Settings.
- `/settings/agents`, opened from the Me sheet: each person sees and removes
  their connected agents.

**Acceptance:** an agent cannot exceed its person's roles, cannot commit,
cannot change the account, and cannot read a brewery that has agents off.

### Phase 2 — MCP endpoint, every read, and orientation

**Test first:** a contract test drives the local route with the official MCP
SDK client, under both protocol versions. It finds an operation, describes it,
runs a query, gets a structured error, and reads the orientation result. A
warehouse token finds no invoice query; an admin token does. A hidden operation
cannot be found or run. A query registered in the test is found with no other
change.

**Modify:**
- New `app/api/mcp/` route (thin, like `app/api/chat/`). It serves four tools,
  not one per operation, so a client's context stays small:
  - `find_operations`: match the person's allowed operations by text.
  - `describe_operation`: description, field table from
    `lib/mgr/api-schema.ts`, and whether it runs or needs approval.
  - `run_query`: run an allowed query through `runCommand`, bounded by
    `boundToolResult`.
  - `propose_command`: added in Phase 3.
- `lib/commands/registry.ts`: `agentHidden` on a definition. `listTools` filters
  on it and `canRun`, and the agent gate in `runCommand` becomes "a query the
  person's roles allow and not hidden".
- The hide list covers every query that reaches past the person's database
  access, plus Ask MGR history and Slack link details. A role says nothing about
  credentials or outside calls: `list_qbo_customers` calls QuickBooks and can
  refresh tokens with the service role. `tests/agent-hidden.test.ts` fails on a
  new query that does this, so that class is closed by default. Plain database
  reads stay open by default, because roles already limit them (Q4).
- `/.well-known/oauth-protected-resource` for MCP auth discovery.
- Server `instructions`, kept under 300 words: what MGR is, volumes are
  stored in bbl, the inventory ledger is append-only and corrections are
  compensating commands, writes are proposals a person approves, and call
  `get_started` first.
- New `get_started` query. It returns who the agent acts for (person, brewery,
  roles, timezone), what it can do by area, `get_today`'s items, links to
  `/docs`, and a `conversationId` the agent sends back on later calls.
- Errors: `CommandError` code, message, and the failing input path, so a
  model can correct and retry.
- `/llms.txt` for `/docs`; `fumadocs-core` ships a `remark-llms` plugin to
  check first.
- The Phase 4 step recorder, wrapped around every MCP tool call.

**Acceptance:** a fresh agent with no prior knowledge answers "what's on
today and what's below par at the taproom?" in a few tool calls.

### Phase 3 — Every write, as a proposal a person approves

**Test first:** any registered command can be proposed, with no code for that
command, and a command registered in the test works unchanged. A bad input or a
role the person lacks is refused when proposing. Only the person's own session
can approve: a bearer approval returns 403, and so does another staff member. An
expired proposal cannot be approved. A double approval commits once. Every id
field in every command's schema has a label, or the test fails.

**Modify:**
- New migration: `agent_proposals` (tenant, RLS): actor, client, command,
  canonical input, status (`pending`, `approved`, `declined`, `expired`,
  `committed`, `failed`), request id, and created and expiry times.
  `create_agent_proposal` is the one write an agent token may make, so it joins
  the reviewed list in `tests/agent-access.test.ts`. It must not touch the ledger.
- `propose_command`: validate the input against the command's schema and check
  `canRun`, store the proposal, and return
  `{ status: "awaiting_approval", proposalId, approveUrl, expiresAt }`.
- New `get_proposal_status` query.
- New `approve_agent_proposal` and `decline_agent_proposal` commands. Approve
  runs the stored command through `runCommand` on the person's session, with the
  proposal's request id. The command's own checks are the staleness check; a
  refusal marks the proposal `failed` and shows why.
- Attribution needs no ledger change. The person's session commits, so `ui` is
  the true origin, and `agent_proposals.request_id` links the agent to the
  ledger row. No RPC changes.
- New `lib/mgr/proposal-labels.ts`: turn a proposal's input into readable fields.
  A person must not approve `skuId: 8f3a…`.
  - One map from id field name to entity, not one per command. 150 of 177
    commands carry ids, across 87 field names. Many are aliases: `toBinId` and
    `fromBinId` are both bins. 21 names cover about two-thirds of the uses.
  - Build on the label queries in `lib/commands/search.ts`; extract them rather
    than copy them.
  - Two awkward cases: the generic `id` field on 12 commands maps by command, and
    line ids such as `lineId` need their parent record.
  - `lib/mgr/api-schema.ts` reads top-level fields today. Extend it to walk
    nested fields such as order lines.
  - An id with no label shows as an unrecognised record with a warning. It is
    never hidden.
- Today inbox card that shows the command's description and labelled fields, and
  the effects from its preview hook where one exists. Add a hook only where the
  input alone does not say what will happen.
- Once this ships, move Ask MGR onto the same tools and delete `aiExposed`.
- Enhancements: wrap a proposal in an MCP Task where the client supports
  Tasks; offer `approveUrl` through URL-mode elicitation where supported.

**Acceptance:** the full round trip works in a client that supports none of
the enhancements, for a command that has no preview hook.

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
- `list_agent_sessions` query and an Admin Agent activity page
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
`leave_note` theme or an unreachable task means a hidden operation to revisit or
a description to sharpen. A frequently declined proposal means its card needs a
preview hook.

### Phase 6 — Guides and release check

- Staff guide: a "Connect your agent" page with consent, scopes, approvals
  and revoking.
- `content/docs/api/`: the MCP endpoint and its auth.
- Before hosted release, run the matrix by hand: MCP Inspector, Claude,
  ChatGPT, Cursor, VS Code, an AI SDK client, the OpenAI Agents SDK.

## Closing the gap

Work in this order, set by the owner on 2026-11-05:

1. Prove one real read in a real client before anything else: the MCP route with
   `get_started` and `run_query`, tried locally from Claude Code and MCP Inspector.
   Everything so far was tested with scripts, not a client. The session swap in the
   hook, client sign-in and `mcp-handler` could each force a design change.
2. Finish Group C on `feat/agent-connect`, so #1773 lands Phase 1 and 2 together.
3. Do Group B alongside it, in separate PRs off `main`. Start with the 129 field
   names that cover 80% of uses.
4. Run the read evals as soon as Group C works, and let their failures decide what
   to write next.
5. Then Group E, then Group F.

Step 1 is done (2026-11-05). `mcp-remote`, a third-party client, found the server,
registered itself, signed in through the consent page and ran `get_started` and
`get_today`. The hook did not get in its way. Claude, ChatGPT, the 2026-07-28
protocol and custom-scheme redirects are still untested.

Each task starts with a failing test, except writing and by-hand checks. Each
says which scorecard rows it moves. Tasks in one group can run in parallel unless
a dependency is named. Run `scripts/agent-readiness.ts` after every task and
report the change in the PR.

### Group A — Measure and ship what is built

1. **Land Phase 1 consent, switch and Agents page.** `feat/agent-connect`. Depends
   on nothing. Moves no row; Phase 2 needs it.
2. **Readiness script (done).** `lib/mgr/agent-readiness.ts`,
   `scripts/agent-readiness.ts` and `tests/agent-readiness.test.ts`, which fails
   if a number drops below its floor. Raise a floor when a number improves.

### Group B — Teach the system (needs no endpoint, parallel with Group C)

3. **Field vocabulary (U1).** New `lib/mgr/field-vocabulary.ts`:
   `Record<string, { meaning: string; unit?: string; entity?: string }>`, keyed by
   field name. There are 300 names, and 129 cover 80% of uses. Same-named fields
   that differ between commands use `.describe()` on the schema. `entity` also
   feeds task 13. Test first: `tests/field-vocabulary.test.ts` fails on any input
   field with no meaning, so a new field cannot ship without one. Accept: U1 is
   all.
4. **Short descriptions (U2).** Rewrite the 13 descriptions under 7 words. Test:
   the readiness ratchet. Accept: U2 is all.
5. **How MGR works guide (U3, U4).** New `content/docs/how-mgr-works.mdx`, linked
   from `content/docs/index.mdx`. Write it in customer language from
   `brewing-domain.md` and the schema decisions. Each concept and lifecycle gets
   an anchor. Test first: `tests/docs.test.ts` fails on a missing anchor. Accept:
   U3 is 16 of 16, U4 is 6 of 6, and the owner has read it.
6. **Undo statements (U5).** Make `compensation` required on `defineCommand`, as a
   sentence or an explicit "cannot be undone" reason. Test first: a command with
   no statement fails to register. Accept: U5 is all.

### Group C — Reach every read (Phase 2)

7. **MCP route.** Add `mcp-handler`. New `app/api/mcp/`, with the contract test
   from Phase 2 first. Depends on task 1.
8. **Open reads by role (R1).** `agentHidden` in `lib/commands/registry.ts`, and
   review the queries once. Test first: `tests/agent-access.test.ts`, a hidden
   query is refused and any other allowed query runs. Depends on task 7.
9. **Discovery tools.** `find_operations`, `describe_operation` and `run_query`.
   `describe_operation` returns the vocabulary from task 3. Depends on tasks 3
   and 8.
10. **Orientation.** `get_started`, and `search_guide` built on the source behind
    `app/api/search/route.ts`. Test first: the contract test. Depends on tasks 5
    and 7.

### Group D — Measure understanding

11. **Read evals (O1, O2, O4, O5).** New `tests/fixtures/agent-evals.json` and
    `scripts/agent-evals.ts`. 30 read tasks from real staff questions, each with a
    known answer on a fixed seed. Reuse the shape of
    `scripts/experiment-production-attention.ts`: cases in a JSON file, `--dry-run`
    that sends nothing, `--live` that refuses to run without credentials, and each
    case run in normal and reversed order. Claude or ChatGPT is the agent under
    test, because that is what staff use. Code scores facts. Jev scores open
    answers against fixed labels, which is what it did well there. Keep a separate
    brewer-reviewed holdout: author-written cases are not a production accuracy
    estimate. The agent run calls a paid model, so it runs by hand, never in CI,
    and needs model credits (#329). Test first: the scorer, on saved transcripts.
    Depends on tasks 9 and 10.
12. **Fix what the evals find.** Repeat until O2 is 90% or more. Most fixes should
    be vocabulary or guide edits. Depends on task 11.

### Group E — Reach every write (Phase 3)

13. **Name lookup (U6).** New `lib/mgr/proposal-labels.ts`, using `entity` from
    task 3 and label queries extracted from `lib/commands/search.ts`. Test first:
    every id field in every command resolves, or the test fails. Depends on task 3.
14. **Proposals (R2).** Migration below, `propose_command`, approve and decline.
    Test first: the Phase 3 list. Depends on tasks 7 and 8.
15. **Inbox card.** Today card with labelled fields. Depends on tasks 13 and 14.
16. **Write evals (O1, O3, O4).** 20 write tasks, scored on the stored proposal.
    Accept: O3 is 85% or more, O4 is 0, O1 is 50. Depends on tasks 11 and 15.
17. **Retire the old list.** Move Ask MGR onto the same tools and delete
    `aiExposed`. Depends on task 15.

### Group F — Go live

18. **Hosted (R4).** Ask first. Follow the hosted order in Risks. Depends on tasks
    1 and 8.
19. **Client matrix (R3).** Run Phase 6 by hand, including a custom-scheme redirect
    from Cursor or VS Code, which is untested. Depends on tasks 15 and 18.

Migration for task 14, named with a timestamp later than main's newest when it is
written:

```sql
create table public.agent_proposals (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references public.breweries(id),
  actor_id uuid not null references auth.users(id),
  client_id text not null,
  command text not null,
  input jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','approved','declined','expired','committed','failed')),
  request_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
alter table public.agent_proposals enable row level security;
```

The policy and the `create_agent_proposal` function follow iron rules 3 and 5.

## Out of scope

- A scope that commits without a person.
- Enterprise-Managed Authorization (Okta/Entra). Revisit for a multi-site
  customer.
- Agent-to-agent (A2A).
- Shared agent memory, Mem0 and similar providers: durable facts belong on
  records through registered commands.
- Slack approvals (Q5).
- Steps that need a browser, such as connecting QuickBooks or uploading a file.

## Risks

- Supabase's OAuth server may lag the spec on CIMD. DCR covers clients
  meanwhile.
- MCP spec churn: two protocol versions run side by side for at least a
  year.
- An agent's model reads tenant data under its own provider's terms. The
  consent page states this, and Admins can turn agents off.
- A generic card shows a command's input, not its effect. A person may approve
  something they do not fully picture. Preview hooks stay the upgrade where that
  matters.
- A generic proposal has no version token, so the check at commit is whatever the
  command already does.
- Many more reads mean more brewery data reaches the agent's model provider,
  including invoices and customers for the roles that can see them. The consent
  page says so, and Admins can turn agents off.
- `risk` metadata is not usable yet: 174 of 177 commands say `mutable` and none
  says `external`, though MGR pushes to QuickBooks. It does not matter while every
  write needs approval. Skipping approval for any write needs an honest pass first.
- A token sent straight to the Supabase API can read anything its person's
  roles can read, including hidden operations. `agentHidden` holds on MGR's own
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
