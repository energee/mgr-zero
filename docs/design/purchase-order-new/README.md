# New purchase order redesign

## Mockups

[Desktop and phone wireframes](mockups.svg) ([PNG preview](mockups.png)). These are design mockups, not application screenshots.

The final design is a flat form. Card containers, the Draft badge, section and line-number headings, repeated material metadata, instructional paragraphs, and separators were removed in response to review. Field labels, optional-lot inputs, line actions, errors, and Save draft remain.

## Current synthetic captures

The PNG captures were refreshed on 2026-10-30 using the seeded local
Demo Brewing tenant and the shared inventory's fictional data.
The legacy `before-*.png` filenames now contain the current empty draft;
they no longer establish a historical before/after comparison.

| Surface | Empty local draft | Populated fictional inventory |
| --- | --- | --- |
| Desktop | [1440 × 1000](after-desktop.png) | [1440 × 1200](after-populated.png) |
| Phone | [390 × 844](after-mobile.png) | [390 × 844](after-mobile-populated.png) |

Additional rendered evidence:

- [Phone footer after scrolling](after-mobile-footer.png).
- [320px narrow layout](after-narrow.png).
- The populated inventory shows expected-lot fields only on tracked materials.
  No vendor order was sent or saved during this privacy refresh.

## Shared ownership

`components/mgr/screens.tsx` New PO and New PO incomplete → `components/mgr/views/new-po.tsx` NewPoView ← `app/(app)/purchase-orders/new-po-form.tsx` NewPoForm ← `app/(app)/purchase-orders/new/page.tsx`.

Both paths keep the full-page staff surface. The live adapter, command payload, authorization, touched-line rules, and optional-slot semantics are unchanged. Quantity now uses the same E.edit primitive directly so it can display a visible label and its own linked error. No schema, RPC, command, or API changed.

## Original redesign verification (historical)

- Real local app: vendor/material selection, negative quantity error after blur, correction to 40.5 purchase units, Add line, removal of the incomplete line, enabled Save draft, successful save and redirect to the PO list showing PO-0001 · Fieldstone Malt · draft.
- Rendered inventory: three lines, expected lots on the two tracked materials, no expected-lot field on the untracked material.
- Flat-form browser smoke: negative quantity error after blur, correction to 2.5, Add line and Remove. At 320px, numeric groups are 288px wide and vertically separated; the page width is exactly 320px. Desktop and 390px phone screenshots were refreshed.
- Screen-only proof plus purchasing, form feedback, and composition checks: 263 tests across 10 files pass. TypeScript passes. ESLint exits zero with seven warnings in unchanged files.
- Simplification removes decorative wrappers and copy without changing option lists, command callbacks, validation, or footer suppression. Line regions and Remove buttons retain nonvisual line numbers for assistive technology.

The responsive review finding was fixed by using one column below 390px, two columns up to 1023px, and three columns from 1024px. No parity-debt entry was added or removed.
