# MGR chat notifications — Slack-first portable design

**Date:** 2026-09-01
**Status:** Approved design; implementation plan at `.agents/superpowers/plans/2026-09-01-chat-notifications.md`
**Initial provider:** Slack
**Future providers:** Microsoft Teams, Discord, Telegram, and other Chat SDK adapters

## 1. Capability

MGR will notify linked brewery staff about actionable work through chat surfaces. The integration projects the same role-filtered, current-state work that belongs in MGR's **Today** experience; it is not an activity feed and never becomes a second source of brewery truth.

The initial Slack release gives staff:

- a private App Home view of their current actionable work;
- one personal DM when work first becomes assigned, due, or overdue;
- morning and midday unresolved-work summaries in one approved private operations channel;
- authenticated links back to the owning MGR flow;
- personal notification snooze, event mute, and quiet-hours controls.

Later phases may complete narrowly eligible tasks inside chat. A chat action is allowed only when MGR owns the query, registered command, canonical preview, stale-version check, durable request replay, and correction path.

The first implementation is Slack-only. The MGR data model and notification contracts are provider-neutral so Teams, Discord, Telegram, or another Chat SDK adapter can be added without renaming schema objects or duplicating notification eligibility rules.

## 2. Fixed product decisions

- Staff only. Wholesale customers and portal operations are excluded.
- One active installation per brewery and provider. A Slack workspace maps to exactly one brewery.
- Slack launches first; no second production adapter is included in this implementation.
- Vercel Chat SDK owns provider transport normalization.
- `@chat-adapter/state-pg` uses the same hosted Supabase Postgres through an isolated private schema and restricted database role.
- App Home and DMs carry personal detail. Shared summaries go to one admin-approved private operations channel.
- Public channels and Slack Connect destinations are prohibited.
- Personal DMs are state-change driven. The team channel receives morning and midday unresolved summaries.
- Brewery timezone and default quiet hours control delivery; linked users may override their own quiet hours.
- No notification class bypasses quiet hours in the first release. App Home remains current during quiet hours.
- The first notification bundle is submitted orders, picks due, assigned next delivery, and overdue fermentation readings.
- MGR owns a brewery-level fermentation reading cadence, default 24 hours and bounded to 1–168 hours. The same value drives Today and every chat provider.
- Projection-only ships before any MGR domain mutation from Slack.
- Fermentation reading is the first candidate operational modal after the trust and replay gates close.
- Clean-order confirmation is a later conditional action requiring a separate eligibility proof.
- A leased Postgres delivery table is the initial queue. Redis, generic event streaming, and a durable workflow engine are deferred until measured need.
- Delivery is at-least-once with semantic deduplication. The product does not promise exactly-once Slack message delivery.

## 3. Existing MGR constraints

This integration must preserve the five iron rules in `.agents/ARCHITECTURE.md`:

1. Every domain read and mutation is a registered query or command.
2. Append-only ledgers are corrected through named compensating flows, never generic undo.
3. Tenant data carries `brewery_id`, RLS, and tenant-safe foreign keys.
4. Service-role access remains narrowly allowlisted and must not impersonate an ordinary user.
5. One user action that writes multiple rows is one Postgres function.

Additional current gates:

- The command endpoint does not yet carry a stable `requestId` or durably replay the first result.
- Registry metadata does not yet implement canonical preview/version/compensation contracts.
- Current request contexts come from a browser cookie or Supabase Bearer token; a signed Slack callback cannot create an RLS-bound MGR actor.
- Notification history has no current schema/query owner.
- Weekly taproom counts, invitation recovery, CSV replay, some shipment invoice timing, and inventory correction remain gated in the application design.
- Several first-slice notification reasons belong to planned slices and become eligible only after their owning MGR Today query and command exist.

Slack does not weaken or work around any of these gates.

## 4. Product surfaces

### 4.1 Personal App Home

App Home is the private, persistent Slack projection of a linked staff member's actionable MGR work.

- Query current work when App Home opens or refreshes.
- Order rows by overdue, due today, then coming soon.
- Filter through current MGR membership, role, assignment, and RLS rules.
- Limit the first view to the highest-value actions; do not reproduce all MGR navigation.
- A row appears only when it explains why action is needed, names the next step, and has a defined resolution condition.
- Resolved, reassigned, stale, or newly unauthorized work disappears.
- App Home may expose notification preferences and linking status.

Slack App Home is an enhancement, not a cross-provider requirement. Future adapters without a persistent personal-home surface fall back to personal messages and authenticated MGR links.

### 4.2 Personal state-change DM

A personal DM is sent once when an eligible item first becomes assigned, due, or overdue for the linked operator.

Each message includes only:

- the operational reason;
- a customer-safe or object-safe label;
- due time or overdue age;
- the minimum fields needed to decide whether to open it;
- one authenticated MGR link;
- eligible personal notification controls.

The delivery pipeline updates the existing message when the provider supports update. A repeated scan or retry does not append a second message for the same occurrence and destination. Resolution updates or suppresses the message; deleting a chat message never changes MGR state.

### 4.3 Private operations-channel digest

One brewery admin selects one channel for shared summaries. Before activation and during delivery, MGR verifies that the destination is:

- private;
- active and not archived;
- joined by the bot;
- not external, shared, or pending shared.

The channel receives one morning and one midday summary of unresolved work. It contains aggregate counts and minimized labels appropriate to every channel member. Detailed data and actions remain personal. Shared buttons may open a personal App Home, modal, or authenticated MGR flow; the clicking user is always re-authorized individually.

The digest message is updated within its cadence window rather than appended repeatedly.
Each digest is a synthetic time-window occurrence whose owning summary query reloads current unresolved work. It is not modeled as multiple item deliveries sharing one provider message.

### 4.4 Production chat preview gallery

MGR Settings → Integrations → Chat includes a preview gallery before and after provider installation. It shows the disconnected and active settings states plus App Home, personal DM, private team digest, preferences, gated fermentation reading, gated clean-order confirmation, and reauthorization failure.

Previews use a committed provider-neutral fixture catalog. They never query live brewery/customer data, send provider messages, or imply that a gated action is available. Provider render-contract tests consume the same fixtures; an accessible web renderer displays them inside Settings. Sharing fixture inputs prevents product copy and data-minimization rules from drifting while allowing Slack Block Kit and web markup to remain platform-correct.

The canonical frames live in `components/mgr/screens.tsx` (build step 8, the **Chat** area), published at `/docs/screens`.

## 5. Initial notification reasons

| Reason | Eligible actor | Trigger owner | Personal content | Resolution | Initial action |
| --- | --- | --- | --- | --- | --- |
| Submitted order awaits confirmation | Sales, admin | Owning Today/order query; submitted transition | Safe order label, requested date, reason review is required | Order no longer submitted or actor no longer eligible | Open authenticated MGR order confirmation |
| Confirmed order is due to pick | Warehouse, admin | Owning Today/pick query using requested ship date and state | Order label, source, line count, due time | Order leaves eligible pick state or assignment/role changes | Open authenticated MGR pick flow |
| Assigned next delivery is ready | Assigned driver, admin | Owning Today/route query using current route and open stop | Stop label, destination-safe label, scheduled time | Stop completes, route changes, or assignment changes | Open authenticated MGR delivery flow |
| Fermentation reading is overdue | Brewer, admin | Owning Today/cellar query; open occupancy whose latest reading (or occupancy start when none) is at least the brewery's configured 1–168-hour cadence old | Vessel, reading age, prior-reading time | A qualifying reading lands, occupancy closes, cadence changes so it is no longer overdue, or actor loses access | Open authenticated MGR reading flow |

The notification layer does not invent due rules. Each reason depends on an owning MGR query that returns a stable subject reference, current reason, due time, state/version token, eligible actors, and resolution condition. If the application cannot provide that contract, the reason does not ship.

## 6. Excluded and deferred reasons

Do not send generic activity, page views, ordinary inventory movement chatter, or routine success events.

The following remain MGR-only until separately approved:

- pick quantities and short-pick resolution;
- shipping, invoicing, and deferred-invoice delivery completion;
- inventory movements and corrections;
- weekly taproom counts until durable count occurrence/line ownership exists;
- PO receiving and multi-line material reconciliation;
- QBO push and mapping repair;
- compliance filing and loss reattribution;
- invitations, role changes, imports, customer operations, and bulk work;
- high-context financial, legal, or append-only corrections.

Future notification reasons are added one at a time from measured demand. Candidate order: ATP shortfalls, QBO failures, overdue PO receipts, packaging close, and compliance expiration. There is no "mirror every Today row" switch.

## 7. Provider-neutral data model

All new tenant-visible tables carry `brewery_id`, RLS, and tenant-safe foreign keys. Secret-bearing Chat SDK tables remain outside the tenant schema. Ordinary authenticated clients receive bounded `SELECT` only on their permitted configuration rows: installation health is column-bounded for admins, while personal links, destinations, and preferences require current brewery membership and an active same-brewery link. All configuration writes, including installation, linking, destination, and preference changes, are deferred to later named registered RPCs/commands.

`breweries` gains `fermentation_reading_due_hours`, an integer constrained to 1–168 with default 24. It is an MGR operating default, not a chat preference. An admin update affects Today and subsequent occurrence scans; existing occurrences are revalidated against the new value before delivery.

### 7.1 `chat_installations`

Owns the MGR mapping and lifecycle for one brewery/provider installation.

Required concepts:

- `id`, `brewery_id`, `provider`;
- external installation/workspace/account identifier;
- external enterprise/organization identifier when applicable;
- display label;
- lifecycle state: pending, active, disabled, needs reauthorization, disconnected;
- single-use OAuth intent hash, exact redirect URI, expiry, consumption, and reconciliation step;
- exact granted capability/scope snapshot;
- installer MGR user;
- installed, disabled, and disconnected timestamps;
- token-store reference/key only, never token material;
- health timestamps and redacted last failure code.

Uniqueness permits at most one active installation for each brewery/provider and prevents one external Slack workspace from being active for more than one brewery.

### 7.2 `chat_user_links`

Maps an installation-scoped external user to an MGR user and brewery.

Required concepts:

- installation, brewery, provider, external user ID, MGR user ID;
- pending/active/disabled/unlinked state;
- link proof hash plus issue, expiry, and consume timestamps;
- linked and disabled timestamps;
- uniqueness within the installation.

Email and display names are not identity keys.

### 7.3 `notification_destinations`

Owns configured delivery targets.

Required concepts:

- installation and brewery;
- personal or channel destination kind;
- external destination ID;
- linked MGR user for personal destinations;
- verified privacy classification;
- provider capability snapshot;
- active/blocked state and reason;
- last validation timestamp.

Slack v1 allows linked personal destinations and one private non-external operations channel.

### 7.4 `notification_preferences`

Owns only necessary delivery preferences:

- MGR user and brewery;
- event/reason enablement;
- personal destination;
- quiet-hours override and timezone behavior;
- created/updated audit fields.

Brewery defaults live with the integration configuration. There is no arbitrary rule builder.

### 7.5 `notification_occurrences`

A narrow notification outbox representing one actionable MGR fact or due window—not generic event sourcing.

Required concepts:

- brewery, reason, subject type/reference;
- urgency, occurred/due time, owning query;
- source transition/version or due-window identity;
- portable minimized payload snapshot;
- semantic dedupe key;
- active/resolved/suppressed state and timestamps.

Mutation-triggered occurrences commit in the same Postgres transaction as the owning domain change. Time-derived occurrences come from a narrow scheduled scan.

The persisted payload is non-authoritative. The owning query rebuilds current safe fields before rendering. A morning or midday digest is a synthetic time-window occurrence keyed by brewery, destination, local date, and cadence window.

### 7.6 `notification_deliveries`

Tracks one occurrence sent to one destination.

Required concepts:

- occurrence, destination, installation, provider;
- queued/leased/retrying/sent/updated/suppressed/terminal state;
- attempt count, lease expiry, next attempt, last provider code;
- external provider message/conversation identifiers;
- sent/updated/resolved timestamps;
- semantic destination dedupe key.

### 7.7 `chat_callback_receipts`

Provides durable provider callback and action dedupe/audit beyond Chat SDK's operational cache.

Store normalized identifiers, installation, provider, received time, disposition, and a redacted payload hash. Do not retain raw callback bodies or secrets.

### 7.8 `chat_action_intents`

Used only when interactive MGR commands become eligible.

An opaque, expiring intent binds:

- installation, brewery, linked MGR actor, provider action origin;
- command name and canonical input hash;
- target subject/version;
- request ID and preview token;
- allowed action, expiry, consumption, and first-result reference.

Provider metadata contains only the opaque intent identifier.

## 8. Chat SDK operational state

Use `@chat-adapter/state-pg` for Chat SDK subscriptions, locks, cache, lists, and queues. The adapter currently creates:

- `chat_state_subscriptions`;
- `chat_state_locks`;
- `chat_state_cache`;
- `chat_state_lists`;
- `chat_state_queues`.

The baseline migration records the adapter's reviewed schema, but `@chat-adapter/state-pg@4.39.0` unconditionally executes idempotent `CREATE TABLE IF NOT EXISTS` during `connect()`. The compatibility spike proved that PostgreSQL therefore requires schema `CREATE` even when every table already exists. The approved deployment boundary is:

1. Pre-create the adapter's exact tables in a private `chat_sdk` schema through the baseline migration.
2. Drop and recreate the cluster-scoped `mgr_chat_sdk` group role during a baseline reset so stale attributes, memberships, or grants fail closed; use a dedicated server-only login with `search_path` restricted to `chat_sdk`.
3. Grant that role `USAGE`, `CREATE`, required table DML, and sequence usage only inside `chat_sdk`.
4. Grant that role no access to MGR public tenant data or any other application schema.
5. Use an environment-specific key prefix.
6. Exercise multiple instances and concurrent installations without key or token bleed.
7. Define periodic cleanup for expired lock/cache/list/queue rows.

Runtime DDL is an explicit exception limited to Chat SDK's isolated operational schema; it is not a general application-migration pattern. Implementation stops if the adapter needs public-schema access, broader database privileges, or object creation outside `chat_sdk`.

## 9. Component boundaries

### 9.1 Chat transport

A single Chat SDK composition owns:

- registered provider adapters;
- Postgres state adapter;
- webhook verification and normalized routing;
- provider installation lookup;
- App Home, message, action, and modal handlers;
- provider-specific rendering and capability fallback;
- low-level send/update operations.

It contains no due calculations, role decisions, tenant selection from untrusted payloads, or domain mutations.

### 9.2 Installation and identity services

Registered MGR commands/queries own:

- begin/complete/reconcile/disconnect installation;
- installation health;
- issue/consume/unlink staff link proof;
- destination configuration and validation state;
- brewery defaults and personal preferences.

Thin HTTP routes perform protocol exchange and dispatch only.

### 9.3 Notification service

MGR owns:

- notification reason definitions;
- occurrence creation/resolution;
- destination fan-out;
- quiet-hour and cadence policy;
- delivery leasing and retry state;
- current-state revalidation;
- provider-neutral payload construction;
- audit and integration health.

### 9.4 Provider renderer

Each provider adapter consumes the same portable notification payload and returns provider-specific messages/cards/actions. It may use richer provider features but must always preserve:

- minimum-data policy;
- personal versus shared distinction;
- the shared provider-neutral preview fixture catalog;
- a platform-correct renderer output schema consumed by contract tests and the Settings preview renderer;
- opaque action intents;
- authenticated MGR deep-link fallback;
- resolution/update semantics;
- accessibility labels.

## 10. Core data flows

### 10.1 Transition notification

```text
RLS-bound registered command
  -> one Postgres transaction commits domain truth and notification occurrence
  -> active preferences/destinations create delivery rows
  -> worker leases delivery
  -> owning registered query revalidates current state
  -> Chat SDK provider sends or updates message
  -> delivery outcome persists
```

A command that writes the occurrence and domain state separately violates the atomic-write rule.

### 10.2 Time-derived notification

```text
Authenticated scheduler wake
  -> narrow internal registered scan/function
  -> due work derived in brewery timezone
  -> outstanding/lookback predicate recovers missed ticks
  -> semantic due-window key deduplicates repeated scans
  -> normal destination fan-out and delivery pipeline
```

The scheduler contains no domain due logic. The internal job boundary can emit notification candidates only; it cannot perform arbitrary tenant reads or writes.

### 10.3 Provider callback

```text
Chat SDK verifies raw request and timestamp
  -> normalized callback receipt is inserted/deduplicated
  -> HTTP success returns inside provider deadline
  -> asynchronous handler resolves installation
  -> external user link resolves to MGR user
  -> current brewery membership and role are re-read
  -> registered MGR query reloads current subject state
  -> personal response, stale result, or authenticated MGR link is rendered
```

If the durable receipt cannot be recorded, return a retryable failure rather than process an untracked callback.

### 10.4 Delivery worker

The worker leases rows from Postgres, resolves the active provider installation and destination, revalidates the owning query, suppresses resolved work, and sends or updates through Chat SDK.

The worker:

- honors provider retry headers;
- proactively serializes sends per provider conversation using provider-specific limits;
- rechecks current destination and preference eligibility before sending;
- uses bounded exponential backoff with jitter for transient failures;
- stops retrying permanent auth/destination errors;
- never logs raw provider errors or tokens;
- never derives MGR truth from the existing chat message;
- exposes lease expiry so another invocation can recover a crash.

No always-on process is required initially. Scheduler and worker hosts are selected after deployment ownership is established, but their authenticated interfaces and database contracts are fixed by this design.

## 11. Installation lifecycle

Only an authenticated brewery admin may start an installation.

1. A registered operation creates a single-use intent bound to admin, brewery, provider, exact redirect URI, random nonce, and ten-minute expiry.
2. The browser redirects to provider OAuth.
3. Chat SDK completes OAuth and stores the provider installation token encrypted in its private state.
4. The callback validates the original intent, returned provider app/workspace identity, exact granted scopes, and installation cardinality.
5. A registered operation activates the MGR installation mapping.
6. Health checks confirm token lookup and minimum capabilities before notifications become active.

Token storage and MGR activation cannot share a transaction. The durable intent therefore records each step. Callback retries are idempotent. A reconciler completes safe partial installations or deletes orphaned provider credentials.

Disconnect behavior:

1. mark the MGR installation disabled first;
2. stop queued sends and invalidate action intents;
3. revoke/delete provider credentials;
4. unlink destinations and users;
5. retain a non-secret audit tombstone.

An emergency MGR kill switch works independently of the provider.

## 12. Staff identity linking

1. A Slack user opens **Link MGR** from their private App Home.
2. The server issues an opaque, single-use challenge bound to installation, external user, and expiry.
3. The link opens MGR and requires normal authentication.
4. A registered command verifies current membership in the installation's brewery and records the link.
5. Every callback re-reads installation state, link state, brewery membership, and current role.

Never auto-link by email, Slack profile, display name, or workspace domain. Customer identities are rejected. Demotion, membership removal, explicit unlink, provider deactivation, token revocation, uninstall, or brewery disconnect disables the link.

## 13. Authorization and trust invariants

- Provider request verification authenticates transport only.
- External installation, enterprise, channel, user, metadata, and form values are untrusted routing claims until resolved against server state.
- Brewery identity comes only from the active server-side installation mapping.
- Channel identifiers are unique only within an installation/provider context.
- A current MGR link and brewery membership are required on every personal action.
- Shared-channel membership never grants MGR authorization.
- Registry Zod validation, role checks, and RLS remain mandatory.
- The service role may maintain private integration metadata only through a documented narrow exception; it must not impersonate a staff member or execute ordinary tenant work.
- Slack metadata never carries trusted command input.
- Raw Postgres, stack, OAuth, or provider errors are never echoed to chat.
- Privilege grants, bulk writes, append-only corrections, financial/compliance operations, and other high-risk actions require authenticated MGR review.

## 14. Delegated command gate

Projection-only delivery does not require Slack to become an MGR actor. Direct operational forms do.

Before any chat action can commit an MGR domain command, a separate approved design must prove how a linked external user receives a short-lived, narrowly delegated, RLS-bound MGR actor context without:

- storing a Supabase refresh token per chat user;
- minting broad user impersonation credentials;
- bypassing RLS with the service role;
- duplicating command role checks in the chat route;
- granting arbitrary internal-job access.

The same gate must prove stable request/result replay, preview/version tokens, current-state revalidation, and named correction/compensation metadata in the registry.

Until then, operational chat input may create only integration-owned preferences, snoozes, and authenticated MGR deep links.

## 15. Interactive form eligibility

A provider form is eligible only when:

- it is personal to one currently linked operator;
- the input fits one bounded form;
- MGR owns the current-state query and registered command;
- canonical preview and expected-version checks exist;
- retries durably return the first result;
- the correction path is explicit;
- no broad context, financial/compliance review, or multi-line reconciliation is required;
- the provider can render the flow safely or fall back to MGR.

### 15.1 Integration-owned controls

Available with projection launch:

- open in MGR;
- snooze this delivery reminder;
- mute/unmute this event type;
- change personal quiet hours;
- refresh personal queue;
- link/unlink MGR identity.

Snooze affects delivery only. It never changes whether MGR considers an item due.

### 15.2 First operational modal: fermentation reading

After the delegated command gate closes:

- personal destination only;
- load current vessel occupancy and prior reading from MGR;
- accept any supported combination of gravity, temperature, and pH;
- show canonical values and a named **Record reading** confirmation;
- bind intent to occupancy version, actor, brewery, command, and request ID;
- return the first result on duplicate submit;
- reject closed/changed occupancy as stale;
- correct through a newer reading in the owning MGR flow, never editing history.

### 15.3 Conditional clean-order confirmation

A later risk review may approve order confirmation only when the current server preview has no ATP, registration, pricing, source, permission, or stale-state warning. Any warning or change forces the full MGR flow. This action cannot ship before the order command's atomic allocation and replay contracts are proven.

## 16. Delivery policy

### 16.1 Quiet hours

- Brewery timezone owns the default schedule.
- Linked users may override personal quiet hours.
- Quiet hours delay noncritical DMs; App Home remains current.
- Team digest windows use brewery local time.
- Daylight-saving transitions have explicit tests.
- No first-release reason bypasses quiet hours.

### 16.2 Deduplication

A semantic occurrence key binds brewery, reason, subject, source state/version or due window. A delivery key adds destination. Repeated scans and retries resolve to the same records.

Provider event/action dedupe and MGR command request dedupe remain separate:

- callback receipt dedupe prevents repeated handling of one provider callback;
- occurrence/delivery dedupe prevents repeated notifications;
- future command request dedupe prevents repeated domain writes.

### 16.3 Resolution

Before send, update, or action, re-run the owning query. If the item is resolved, reassigned, stale, or no longer visible:

- suppress an unsent delivery;
- update a known message to a non-actionable resolved state when useful;
- reject an action with a generic personal stale message;
- offer refresh or authenticated MGR navigation.

## 17. Provider-neutral rendering contract

MGR produces a structured payload containing:

- reason and urgency;
- subject reference and safe title;
- minimal fields;
- due time/overdue age;
- owner/assignment class;
- resolution condition identifier;
- allowed opaque action intents;
- authenticated MGR URL.

Provider adapters render the richest safe supported surface.

| Capability | Portable requirement | Slack implementation |
| --- | --- | --- |
| Personal delivery | Private notification or deep-link fallback | DM |
| Persistent personal inbox | Optional enhancement | App Home |
| Shared summary | Approved non-external private destination | Private channel |
| Message update | Update when supported; otherwise deduped resolved follow-up | `chat.update` through adapter/client |
| Form/modal | Eligible action or MGR fallback | Block Kit modal |
| Buttons | Opaque personal intent only | Block Kit action |
| Destination validation | Provider-specific privacy/member validation | Slack conversation checks |

Future Teams, Discord, Telegram, and other adapters receive separate OAuth/scope, uninstall, destination, rate-limit, rendering, and threat review before activation.

## 18. Slack permissions and destination safety

Initial Slack bot scopes remain minimal:

- `chat:write`;
- `im:write`;
- only the channel-read scopes required to select and revalidate the approved private operations channel.

Do not request `chat:write.public`, message histories, `users:read.email`, file scopes, user tokens, broad admin scopes, or slash-command permissions until a named feature requires them.

At send and click time, validate the configured team channel remains private, active, bot-member, and non-external. Public, archived, Slack Connect, and arbitrary destinations fail closed.

Never post:

- provider or MGR credentials;
- customer contact information;
- prices, balances, or license numbers;
- signatures or free-text operational notes;
- raw command inputs or hidden identifiers;
- raw database/provider errors.

## 19. Token and secret lifecycle

Global Slack client/signing secrets and Chat SDK encryption keys live in the deployment secret manager. Installation tokens are encrypted with a separately managed AES-256-GCM key in the private Chat SDK state store.

The compatibility spike must verify current Chat SDK multi-workspace behavior for:

- OAuth state and callback replay;
- encrypted set/get/delete installation;
- concurrent installation token isolation;
- Slack token rotation and serialized single-use refresh tokens;
- revoked tokens, missing scopes, uninstall, and invalid authentication;
- key rotation and recovery procedures.

If the adapter cannot safely manage token rotation, token custody moves behind a reviewed external installation provider before production. Do not silently disable the security requirement.

Never log OAuth codes, access/refresh tokens, client/signing/encryption secrets, authorization/signature headers, response URLs, raw callback bodies, or raw form contents.

## 20. Failure and recovery behavior

| Failure | Behavior |
| --- | --- |
| OAuth canceled, forged, expired, workspace-mismatched, or installer removed | Installation remains inactive; consume intent once; restart from authenticated MGR |
| Partial OAuth/token/MGR activation | Durable intent reconciles or deletes orphaned provider credential |
| Token invalid/revoked or scope removed | Disable affected delivery; show admin reauthorization health |
| Channel archived, externalized, or bot removed | Disable shared summary; preserve eligible personal delivery; require admin correction |
| Provider `429` | Honor `Retry-After`; retry after lease delay |
| Provider/network `5xx` | Bounded exponential backoff with jitter |
| Permanent provider `4xx` | Terminal redacted failure; no retry loop |
| Worker crash | Lease expires and another invocation retries |
| Scheduler outage | Outstanding/lookback scan recovers missed work using same due-window key |
| Item resolves before send | Revalidation suppresses delivery |
| Item changes after render | Reject stale action; update/refresh/deep-link |
| Send succeeds but response persistence fails | Rare duplicate is possible; dedupe/update when message identity is known |
| Disconnect/uninstall | Disable first, stop queue, invalidate actions, then revoke/delete credentials and retain non-secret tombstone |

## 21. Operator controls and observability

MGR Settings → Integrations → Chat provides:

- provider and workspace identity;
- installation lifecycle and granted-capability health;
- approved operations destination;
- brewery quiet-hours default;
- linked-user count;
- last successful callback and delivery;
- queued, retrying, and terminal delivery counts;
- redacted recent failures;
- reinstall, disable, disconnect, and emergency stop.

This is integration health, not an employee-facing notification history.

Metrics:

- send/update success and retry exhaustion;
- duplicate occurrence, message, callback, and action rates;
- stale/unauthorized action rejection;
- due-to-view and due-to-completion time;
- unresolved work at digest boundaries;
- mute/snooze rate by reason;
- disconnected installations and invalid destinations;
- cross-installation routing failures;
- provider rate-limit responses and queue age.

Any cross-tenant disclosure, unauthorized action, token exposure, repeated duplicate domain write, externally shared destination, or inability to stop delivery after disconnect triggers immediate disable and incident review.

## 22. Verification

### 22.1 Real-Postgres tests

- one active installation per brewery/provider and external-workspace uniqueness;
- cross-tenant RLS for every MGR-owned integration table;
- explicit user linking and rejection of email-based assumptions;
- removed/demoted users fail on the next action;
- occurrence semantic dedupe and due-window recovery;
- transition change plus occurrence is atomic;
- destination fan-out and preference/quiet-hour precedence;
- delivery leasing, retry, suppression, update, terminal failure, and lease recovery;
- brewery timezones and daylight-saving transitions;
- default 24-hour fermentation cadence, 1–168 validation, admin-only update, no-reading occupancy fallback to `started_at`, and occurrence revalidation after cadence changes;
- disconnect/uninstall stops queued delivery and invalidates intents;
- request/result replay, preview token, expected version, and stale behavior before writes are enabled.

### 22.2 Chat SDK and Slack contract tests

- raw-body signature verification and old-timestamp rejection;
- duplicate Events API and interaction delivery;
- response path meets Slack's three-second acknowledgment deadline without running slow work inline;
- OAuth state replay, workspace mismatch, partial completion, reinstall, encrypted installation lookup, and deletion;
- App Home, DM, Block Kit action, modal, message update, `429 Retry-After`, revoked token, missing scope, channel externalization, and uninstall fixtures;
- Postgres state adapter works with runtime DDL confined to the isolated `chat_sdk` schema and no public-schema access;
- concurrent workspace token resolution cannot bleed across installations.

### 22.3 Preview and wireframe verification

- fixture coverage for disconnected, active, link, App Home, DM, digest, preferences, gated forms, and reauthorization states;
- fixture content contains no contact, price, license, credential, signature, free-text note, or hidden identifier fields;
- web previews and Slack contract tests consume the same fixture identifiers and portable payloads;
- Settings previews make no provider API call and do not read live tenant subjects;
- pure renderer tests cover fixture labels and gated-state copy without a provider call;
- browser verification covers keyboard selection, visible focus, modal focus return, responsive reflow, and the production Settings gallery at phone and desktop widths;
- the wireframe artifact renders 73 total frames, 10 Chat frames, both phone/desk modes, and no horizontal overflow.

### 22.4 Adapter conformance suite

Every future Chat SDK adapter must prove:

- installation-to-brewery isolation;
- explicit staff linking;
- destination privacy classification;
- minimized shared output;
- occurrence and callback dedupe;
- quiet hours and routing;
- stale/unauthorized action rejection;
- message update or safe fallback;
- disconnect and queued-delivery shutdown;
- unsupported-form fallback to authenticated MGR;
- redacted audit output.

### 22.5 Manual Slack sandbox

- install one brewery workspace;
- link each staff role;
- exercise every first-slice notification;
- inspect personal versus team data minimization;
- observe quiet-hour queue and digest update;
- resolve, reassign, and stale each item;
- revoke role, archive/externalize channel, remove bot, revoke token, and uninstall;
- inspect App Home, messages, buttons, and modals visually and with keyboard/screen-reader labels.

Automated tests do not call production Slack APIs.

## 23. Rollout

### Stage 0 — compatibility and trust spike

Prove:

- Chat SDK Postgres runtime DDL is confined to the isolated `chat_sdk` schema with no public-data privilege;
- multi-workspace OAuth and encrypted installation lifecycle;
- callback acknowledgment and durable handoff;
- App Home, DM, update, modal, rate-limit, uninstall, and token-rotation behavior;
- partial installation recovery;
- internal job authorization;
- no cross-installation token or state bleed.

A failed proof returns to architecture review; implementation does not work around it.

### Stage 1 — portable integration foundation

Implement provider-neutral MGR schema/contracts, Slack installation/linking, destination configuration, preferences, occurrences/deliveries, callback receipts, worker leases, audit, and kill switch.

No domain writes from Slack.

### Stage 2 — daily operations projection

Enable the four initial reasons through App Home, state-change DMs, and twice-daily private operations summaries. Add quiet hours, message update/resolution, and integration health.

### Stage 3 — integration-owned forms

Enable snooze, event mute, personal quiet-hours override, refresh, and link/unlink. These mutate only chat integration state.

### Stage 4 — fermentation reading

Only after delegated RLS actor, request/result replay, canonical preview, expected-version, and correction gates pass.

### Stage 5 — conditional clean-order confirmation

Separate risk review. Only warning-free, current server previews qualify; every warning routes to MGR.

### Stage 6 — additional Today reasons

Add one measured reason at a time. Re-evaluate notification fatigue and operational completion before each expansion.

### Stage 7 — second provider gate

Choose one provider based on customer demand. Add its Chat SDK adapter, provider-specific security review, sandbox, renderer, lifecycle handling, and conformance fixtures. MGR occurrence eligibility and domain commands remain unchanged.

## 24. Documentation obligations

Implementation updates all affected owners in the same logical changes:

- `.agents/ARCHITECTURE.md`;
- schema design and schema decisions;
- UI layout plan and wireframes;
- `public/docs/user-guide.html`;
- `README.md` environment, setup, OAuth, and local Slack testing;
- Slack app manifest and scope rationale;
- HTTP/command documentation for every registered integration operation;
- `.agents/PROGRESS.md`;
- inline module comments and stale comments in modified files.

## 25. Non-goals

- Wholesale customer or portal chat integration.
- A chat activity/audit feed.
- AI conversation inside Slack.
- Arbitrary slash commands.
- Public or externally shared channel delivery.
- User-token impersonation.
- Direct Slack domain writes before all delegated-identity and replay gates pass.
- A production Teams, Discord, Telegram, or other adapter in the first implementation.
- Cross-provider duplicate-routing policy before a second provider is approved.
- Redis, generic event bus, generic workflow engine, or exactly-once provider delivery.

## 26. Implementation handoff

The design is ready for an implementation plan only after the written specification is reviewed and approved.

The implementation plan must:

- begin with the compatibility/trust spike and stop on a failed proof;
- name tests before implementation work;
- distinguish existing commands from planned/gated capabilities;
- keep schema changes in the baseline migration while the product remains pre-deploy;
- serialize tasks that share the migration, registry, or integration route boundary;
- identify safe parallel tracks for transport fixtures, provider-neutral notification logic, settings UI, and documentation;
- include full real-Postgres, type-check, lint, and Slack sandbox verification gates;
- preserve projection-only delivery as a usable stopping point even if direct operational forms remain blocked.

## 27. Primary external references

- Slack OAuth v2: <https://docs.slack.dev/authentication/installing-with-oauth/>
- Slack request verification: <https://docs.slack.dev/authentication/verifying-requests-from-slack/>
- Slack interactivity and three-second acknowledgment: <https://docs.slack.dev/interactivity/handling-user-interaction/>
- Slack App Home: <https://docs.slack.dev/surfaces/app-home/>
- Slack Web API rate limits: <https://docs.slack.dev/apis/web-api/rate-limits/>
- Chat SDK Slack adapter: <https://chat-sdk.dev/adapters/official/slack>
- Chat SDK state adapters: <https://chat-sdk.dev/docs/state-adapters>
- Chat SDK Postgres adapter: <https://chat-sdk.dev/adapters/official/postgres>
