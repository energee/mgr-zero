# Agent compatibility: which clients work, and which parts of MGR agents cannot reach

Status: draft for owner review, 2026-11-15. Extends `docs/plans/agent-access.md`
(#1766). It adds no feature. It says what to check so that Claude, ChatGPT and the
other clients work, and it lists where MCP stops.

The request on #1766 was to "add a plan to ensure it's compatible" and to "document
which parts of the site are not compatible with MCP". This reads "it" as the agent
access work, including vendor voice modes (the question above it on the issue). If
"it" meant something else, say so and the plan changes.

## Part 1. Parts of MGR an agent cannot use

An agent reaches MGR through four tools: `find_operations`, `describe_operation`,
`run_query` and `propose_command` (plus `get_started` and `leave_note`). Anything
outside the registry has no tool. Four kinds of gap follow.

### A. Hidden on purpose (`agentHidden`)

These operations exist, but agents cannot find or run them. Source: `agentHidden`
in `lib/commands/`; `tests/agent-hidden.test.ts` keeps the list closed by default.

| Area | Operations | Why |
| --- | --- | --- |
| Who has access | `invite_staff`, `invite_customer_user`, `update_staff_role`, `revoke_staff`, `revoke_customer_user`, `resend_account_invitation`, `revoke_account_invitation` | Access changes need a person. |
| QuickBooks | `connect_qbo`, `disconnect_qbo`, `get_qbo_connection`, `list_qbo_customers`, `list_qbo_items` | Credentials, and live calls to QuickBooks. |
| Square | `connect_square`, `disconnect_square`, `get_pos_integration_health` | Same. |
| Slack | `get_chat_integration_health`, `list_chat_user_links`, `get_chat_link_intent`, `consume_chat_link_proof`, `unlink_chat_user` | Link proofs and outside identities. |
| TTB label registry | `search_colas`, `get_cola_details`, `get_cola_image` | Live calls to TTB. |
| Agent controls | `set_brewery_agents_enabled`, `approve_agent_proposal`, `decline_agent_proposal`, `list_agent_proposals`, `list_agent_sessions`, `get_agent_session` | An agent never approves itself or reads other agents' notes. |
| Ask MGR | `preview_command`, `list_chat_conversations`, `get_chat_history` | Private chat history. |

The list above was read from the code on 2026-11-15, and may lag it. The test is the
source of truth; the guide should be generated or checked from the registry, not
copied from this table.

### B. Needs a browser or a person

| Step | Where | Why an agent cannot do it |
| --- | --- | --- |
| Sign in, reset password, accept an invite, create a brewery | `/login`, `/password`, `/reset`, `/accept`, `/create-brewery`, `/invitations` | Account setup belongs to a person. An agent token cannot change the account (Phase 1). |
| Consent to an agent | `/oauth/consent` | The consent page is the point of the design. |
| Approve or decline a proposal | `/proposals`, `/proposals/[id]`, Today inbox | Only the person's own session approves (Q10). A tap on a phone is the intended voice flow. |
| Turn agents on, remove an agent | `/settings` (Admin switch), `/settings/agents` | Hidden operations. |
| Connect QuickBooks, Square or Slack | `/settings/accounting`, `/settings/pos`, `/settings/chat` | OAuth in a browser; out of scope in `agent-access.md`. |
| Read the Agent activity log | `/settings/agents/activity` | Notes are untrusted agent text; shown only to an Admin. |

### C. Customer portal

The portal (`/portal/login` and its pages) is for a buyer's login. An agent acts
as a staff member, so it has no portal view. Portal-only operations, if any, are
outside the staff roles it carries. Check this rather than assume it (step 4 in Part 2).

### D. Output an agent can read poorly

- **Images and files.** `get_cola_image` is hidden. Label art, PDFs and printed
  documents (invoices, pick sheets, brew sheets) are pages, not tool results. An
  agent gets the data behind them, not the layout.
- **Charts and live boards.** `/taproom/board`, the cellar map and similar screens
  have data queries but no picture. An agent can describe the numbers.
- **Large lists.** `boundToolResult` caps what comes back. A question that needs
  every row must be paged, or asked another way.
- **Writes that need no tap elsewhere.** None. Every write is a proposal, so an
  agent can never finish a write on its own. A hands-free client still needs a tap.

### E. Not yet checked

I have not verified these and they should not go in a guide until someone has:

1. Whether `import_csv` can be proposed usefully, since a person normally picks a
   file in the browser.
2. Whether any query that is not hidden calls out to a provider (the hide list is
   meant to cover them; `tests/agent-hidden.test.ts` is the guard).
3. Whether any operation lacks a usable name on its approval card (U6, 325 of 335).
   The eight gaps show as "unrecognised record".

## Part 2. Plan to make the clients compatible

The release row is R3: 7 of 7 clients finish a read and a proposal. It is 0 of 7.
This plan adds the checks that make "finish" mean something, and adds voice as a
column. Every step is by hand until a client can be scripted.

### Prerequisite

Hosted sign-in works (R4): token hook confirmed, dynamic client registration on,
`registration_endpoint` present in the OAuth metadata. Until then no vendor client
can register. Ask-first; owner action.

### Steps

1. **Fix the matrix columns.** Per client record: connects, signs in through the
   consent page, `get_started`, one `run_query`, one `propose_command`, approval in
   MGR, `get_proposal_status` shows the result. Add a "voice mode" column for Claude
   and ChatGPT.
2. **Run the local clients first.** MCP Inspector, then an AI SDK client and the
   OpenAI Agents SDK, which need no vendor plan. Record protocol version used
   (2025 or 2026-07-28), because both are served from one endpoint.
3. **Run the vendor clients.** Claude, ChatGPT, Cursor, VS Code. Cursor and VS Code
   also test a custom-scheme redirect, which is untested. Note the plan or seat each
   needs for custom connectors, because a brewery must buy it.
4. **Check the Part 1 gaps against reality.** For each client, try a hidden
   operation and a portal-only action and confirm a clear error, not a crash. Close
   section E above, then correct this document.
5. **Voice.** In Claude and ChatGPT voice mode, ask the `agent-access.md` acceptance
   question ("what's on today and what's below par at the taproom?"), then propose
   one write and approve it by tapping. Record whether voice can call a custom MCP
   server at all, whether results read aloud sensibly, and how it does in a loud
   room. Do nothing in MGR for voice unless this fails (no spoken-summary tool, no
   transcription provider, Negative 1).
6. **Write down what each client cannot do.** Put the result in the "Connect your
   agent" guide and in `content/docs/api/` as a short compatibility table. Update
   the scorecard R3 number in `agent-access.md`.
7. **Keep it from drifting.** Re-run the matrix when `mcp-handler` or the MCP SDK
   changes major version, when the Supabase Auth image changes (the hook test), and
   before each hosted release.

### Pass and fail

- A client passes when it finishes every column of step 1. A client that fails one
  is listed with the column and the reason, not removed.
- Any case where an agent commits without approval, or reads past the person's
  roles, blocks release (O4), whichever client it came from.
- If a vendor's voice mode cannot reach a custom MCP server, say so in the guide.
  That is a finding about the vendor, not a bug in MGR.

### What this does not do

- No new tools, no spoken summaries and no speech-to-text in MGR.
- No change to the hide list. Section A is a record of it.
- No hosted change. Everything above is by hand, after the owner's hosted steps.

## Open questions for the owner

1. Is "compatible" here the client matrix plus voice, as read above?
2. Should the guide list the hidden operations by name, or only by area? By area
   ages better.
3. Who has the vendor plans needed for Claude and ChatGPT custom connectors?
