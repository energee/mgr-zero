---
name: screen-parity
description: Enforce shared rendering between MGR screen inventory and the live application when adding, changing, reviewing, or auditing screens, forms, dialogs, and entry flows. Validate component composition and data boundaries in code; inventory supplies fixtures and the application supplies database-backed data and actions.
---

# Screen parity

The inventory and application must render the same UI components, including
forms and surface wrappers. Given equivalent data, permissions, state, and
viewport, they must have the same layout, fields, labels, actions, validation
presentation, and responsive behavior. The difference is how data and effects
are supplied: fixtures and local simulated actions in the inventory; existing
database-backed queries and authorized commands in the application.

The screen explorer is the interface source of truth. When the explorer and
live application differ, preserve the explorer's layout, content hierarchy,
fields, verbs, states, and responsive behavior unless the user explicitly
changes the design. Extract that implementation into shared components, then
bind the live application's existing data, validation, permissions, and command
behavior to it. Do not redraw the explorer to match a thinner live screen or
treat existing live markup as authoritative merely because it already works.

## Ownership and scope

Read `AGENTS.md` and `.agents/ARCHITECTURE.md`, then trace the affected screen
through these owners:

- `components/mgr/screens.tsx`: inventory records and composition.
- `components/mgr/views/`: shared presentation, including reusable form bodies.
- `lib/mgr/*-view.ts`: pure adapters; `lib/mgr/fixtures/`: inventory data.
- `lib/mgr/screen-routes.ts`: inventory-to-live mapping.
- `app/(app)/`, `app/(portal)/`, `app/(auth)/`: live data/action adapters.
- `components/mgr/screen-frame.tsx`, `screen-explorer.tsx`, `demo-screens.tsx`,
  `me-sheet.tsx`, `command-form.tsx`, and layouts: actual surface composition.

Follow the task's scope. An audit is read-only. A fix covers the affected shared
owner and its callers; discovering unrelated debt does not authorize a site-wide
rewrite. Read the installed Next.js guides before changing framework code.

## Required code patterns

1. Both paths mount the same exported presentation component. Resolve the
   symbol through aliases, barrel exports, and intermediate components: an
   import string alone is not proof. A thin live adapter may mount the view
   indirectly. Inventory records must also use the shared component, rather
   than retain a second inline `E.*` drawing.
2. Both paths use the same product surface and configuration: shell, entry
   card, dialog/sheet choice, header, footer, sizing, and mobile behavior.
   Explorer-only viewport controls, captions, and navigation scaffolding may
   surround it. A generic inventory `CommandForm` and a separate live dialog
   fail even if their inner view is shared.
3. Interactive fields and layout have one owner. Pass controlled values,
   callbacks, options, errors, busy state, and navigation destinations into
   shared controls. A slot may bind behavior or compose another shared
   component; replacing the whole fixture form, table, header, or footer with
   independently drawn live markup is a bypass. Trace slot implementations.
4. Keep fixture imports, sample values, and demo identities out of the live
   render path. Keep database clients, server actions, session lookups, and
   command execution out of shared presentation and inventory adapters.
   Inventory callbacks may simulate state locally but must not invoke live
   mutations. Live reads/writes remain at existing authorized query/command
   boundaries; do not add direct database access to make a view work.
5. Data differences must stay data differences. Do not introduce `isDemo`,
   `isInventory`, route checks, or environment branches that select alternate
   layouts. Fixture and live adapters must satisfy the same view contract;
   fixture data must not invent domain facts missing from live payloads.
   Preserve explicit `null` slot suppression and missing values. Inventory
   links stay inert or within the explorer; live destinations are explicit.

Sharing `E.*`, CSS classes, a view model, or a generic `CommandForm` alone does
not satisfy this contract. Neither does mounting the correct view while
overriding all its visible content.

When converting a static explorer control into a working shared control, keep
the explorer's visible design and add the smallest controlled interface needed
by the live adapter. Preserve live-only behavior that is not visual—command
payload construction, authorization, validation, busy/error handling, request
ids, and redirects—unless it contradicts the screen specification. If live data
cannot supply a fact shown by the fixture, keep the field absent or gated; do
not invent production data and do not delete the intended field from the
explorer as a shortcut.

## Validate from source

For each affected screen, record this chain with file and symbol references:

`inventory record → shared surface + view ← live route/trigger adapter`

Follow actual JSX/component composition, imports, prop assignments, and slots
until both paths meet. Include header-opened dialogs, nested forms, success
states, auth pages, and persona overrides; a route file scan misses these.
Search with `rg` to find candidates, then inspect the code. Do not count every
file without a `views/` import as a defect: it may delegate to a shared child.

For an audit, report each chain as shared, bypassed, or unresolved, with the
exact divergent component or boundary. Enumerate live routes and inventory
records in both directions. Distinguish absent/gated future functionality
from duplicated existing UI; external venue frames are not live MGR routes.
Do not publish a definitive total from an import-only search.

For implementation, add or strengthen deterministic checks for the affected
contract. Prefer the installed TypeScript parser for structural source checks
that resolve JSX symbols and composition, or component assembly tests that
assert the actual shared component and surface identities. Do not build a
new generic analysis framework when a focused existing test can prove it.

Refactor in this direction:

`explorer drawing → shared interactive view ← live data/action adapter`

Start from the explorer record and its states. Move its presentation into the
shared view without changing the design, replace static fixture-only controls
with controlled shared controls, then adapt the live route or trigger to that
view. Remove the old live JSX only after its command and validation behavior is
represented through the shared interface.

Meaningful regression cases must reject:

- An unused import of the expected view beside a separate JSX tree.
- A different wrapper around the correct shared body.
- A live-only form/table replacing the fixture drawing through a slot.
- Fixture dependencies reaching live presentation or live mutations reaching
  inventory presentation.

They must accept a thin adapter or re-export that genuinely delegates to the
shared component. Use equivalent fixture/query payloads when checking adapter
output; different customer data or permission states are not visual defects.
Exercise shared form state and error handling through controlled inputs and
callbacks without a database where possible.

The existing `tests/app-screen-parity.test.ts` file-existence and permissive
`E | CommandForm | views/*` import checks are discovery checks, not proof of
component parity. A screen-route map must identify the corresponding screen
implementation, not merely a parent page that exists. Do not weaken assertions
or add blanket exceptions to make existing bypasses pass. Report existing debt
explicitly; do not claim global enforcement from checks covering only one flow.

## Completion gate

For changed behavior, demonstrate the relevant regression failing before the
fix and passing afterward. Run the repository's required pure tests, typecheck,
and lint for UI code; leave database-backed suites to CI's fresh database.
Full CI unit tests and build must pass for the pushed revision before declaring
a PR ready. Pending, unavailable, or failed checks are not a pass.

Screenshots and browser checks may satisfy the repository's visual smoke-test
requirement, but never establish architectural parity. Report the shared view,
surface, fixture adapter, live adapter, code-based evidence, and any remaining
gap. Skill installation alone does not add a CI gate or repair existing UI.
