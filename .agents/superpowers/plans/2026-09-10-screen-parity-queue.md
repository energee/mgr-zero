# Independent screen-parity queue

Status: in progress. Inspected 2026-09-10 against `origin/main` at
`b3d536c` and the `taproom-truth/.local/handoffs/mgr-sol-2026-09-08` handoff.

Five presentation slices, covering seven screen records. These avoid the
handoff's feature implementations, but are not unconditionally conflict-free:
F2 owns the final parity sweep, and inventory/docs/test files are shared.
Treat these as producer tasks for F2 to verify, not a competing sweep.

## Execution rules

- Before claiming each item, check current handoff ownership, local branches,
  and open PRs. If another worker has claimed its files, defer that item.
- One item per branch/worktree under `.agents/worktrees/`, based on current
  main. Land in queue order; refresh the next branch after each merge.
- Limit changes to the named form/view, its existing model/fixture, its
  inventory wiring, focused tests, and applicable customer-guide section.
  Serialize edits to `components/mgr/screens.tsx`, purchasing fixtures/tests,
  `tests/screen-view-composition.test.ts`, and `content/docs/staff-guide.mdx`.
- No command/query contracts, migrations, shared picker primitives, composer,
  or offline behavior changes. A dependency on those makes the item blocked,
  not permission to expand it. Do not reset the shared development database.
- Do not modify the handoff's state files. Include landed PRs and removed debt
  entries in the implementation handoff so F2 can consume the results.

## Queue

- [x] **PQ-1 — Bin create/edit parity** — PR #290
  - Owners: `app/(app)/locations/bin-form.tsx` and
    `components/mgr/views/bin.tsx`.
  - Render the shared Bin view inside the same surface configuration used by
    inventory; replace the separately authored live form body.
  - Preserve controlled name, create/edit titles and submit labels, Remove on
    edit, delete errors, busy/required states, and the last-bin restriction.
    Keep bin IDs and existing commands unchanged; do not change bin pickers.
  - Exit: remove the `Bin` composition-debt entry; verify create and edit,
    including failed removal and reopening/reset behavior.

- [x] **PQ-2 — Vendor form parity** — PR #291
  - Owners: `app/(app)/vendors/vendor-form.tsx` and
    `components/mgr/views/vendor.tsx`.
  - Replace the whole-form slot bypass with shared controlled fields. Bring
    the live phone field into the shared view, fixture, and guide.
  - Preserve name, email, phone, payment terms, lead-time days, validation,
    reset, errors, and submit state. Do not change Contracts or QBO mappings.
  - Exit: remove the `Vendor` debt entry; exercise create/edit and every field
    through the shared body, including phone and numeric lead time.

- [ ] **PQ-3 — Compliance registry forms parity (three screens)** — blocked:
  the shared `DatePicker` used by the explorer has no controlled value/change
  contract, and this queue excludes shared picker changes.
  - Owner: `app/(app)/compliance/registry/registry-forms.tsx`, with
    `components/mgr/views/brand-approval.tsx`, `state-registration.tsx`, and
    `license.tsx`. Keep these together because they share the live owner.
  - Compose all three shared views and surfaces, retaining existing payloads.
    Preserve COLA/formula selection and number label, optional dates/numbers,
    state validation/normalization, and locked registration/license key fields
    on edit. Brand selection must retain IDs, not derive them from labels.
  - No compliance policy, reports, TTB calculations, or schema changes.
  - Exit: remove `Brand approval`, `State registration`, and `License` debt
    entries; verify create/edit, locked keys, errors, and optional fields.

- [x] **PQ-4 — Material form parity** — PR #292
  - Owners: `app/(app)/materials/material-form.tsx` and
    `components/mgr/views/material.tsx`.
  - Share the controlled form body and surface for name, category, base and
    purchase units, conversion factor, default vendor, lot tracking, and active.
  - Preserve positive-factor validation, optional vendor IDs, existing unit
    edit rejection, errors, reset, and submit behavior. Do not invent reorder
    controls or alter Materials list, counts, purchasing commands, or recipes.
  - Exit: remove only the `Material` debt entry; verify both toggles, optional
    vendor, unit/factor controls, and server-error display in create/edit.

- [ ] **PQ-5 — Schedule batch form parity** — blocked by the same controlled
  `DatePicker` prerequisite as PQ-3.
  - Owners: `app/(app)/batches/new-batch-form.tsx` and
    `components/mgr/views/schedule-batch.tsx`.
  - Share the body and surface while retaining optional intended brand and
    recipe version, required planned date, positive planned barrels, and note.
  - Preserve IDs, date values, validation, reset, and errors. Do not fabricate
    barrel volume, require optional selections, or modify batch queries,
    cellar completion, fermentation readings, or outbox behavior.
  - Exit: remove the `Schedule batch` debt entry; verify empty optional picks,
    selected IDs, invalid quantity, successful reset, and failed submission.

## Completion gate for every item

The explorer remains the interface source of truth. Both paths must render
the actual shared view, controls, and surface—not merely import a view or
replace its entire body via a slot. Fixtures supply data; live adapters supply
state/actions. Preserve explicit null slots, live verbs, accessibility, and
fixture links (`#` unless explicitly supplied).

Start with a failing focused test for the adapter/control logic, then convert.
Add composition coverage proving the shared body and surface are used; remove
only the completed debt entries. Update the staff guide for changed visible
fields or behavior. Run focused pure tests, the inventory pure suite specified
in `AGENTS.md`, TypeScript, lint, and `git diff --check`. Use the browse skill
to inspect inventory and live create/edit states at desktop and mobile sizes.
CI's fresh-database suite and build remain the merge gate. Import-count tests
alone are not proof of full parity.

## Outside this queue

- Composer and shared picker changes: C3.
- Offline/outbox and Session expired behavior: C4, with F2 parity verification.
- Inventory read completeness/paging: F1.
- Contract detail, Formats/BOM, and the final full-screen crosswalk: F2.
- Accounting/QBO/portal payment flows: Q cards; Square/POS/menu publication:
  P cards; taproom board/count/variance/cellar work: existing handoff owners.

Already delivered, not requeued: Record movement (#286), Channel (#287),
Contracts list (#288), and New transfer (#289), all merged on 2026-09-10.
Contracts list completion does not establish Contract detail parity.
