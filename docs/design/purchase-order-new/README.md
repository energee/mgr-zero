# New purchase order redesign

## Mockups

[Desktop and phone wireframes](mockups.svg) ([PNG preview](mockups.png)). These are design mockups, not application screenshots.

The final design is a flat form. Card containers, the Draft badge, section and line-number headings, repeated material metadata, instructional paragraphs, and separators were removed in response to review. Field labels, optional-lot inputs, line actions, errors, and Save draft remain.

## Before and after

Screenshots of the local `/purchase-orders/new` route with the same empty draft and dark theme. Desktop: 1440 × 1000. Phone: 390 × 844.

| Surface | Before | After |
| --- | --- | --- |
| Desktop | [Before](before-desktop.png) | [After](after-desktop.png) |
| Phone | [Before](before-mobile.png) | [After](after-mobile.png) |

Additional rendered evidence:

- [Phone footer after scrolling](after-mobile-footer.png): validation reason and Save draft remain reachable above navigation.
- [320px narrow layout](after-narrow.png): quantity and unit cost stack rather than overlap.
- [Populated inventory](after-populated.png) and [phone inventory](after-mobile-populated.png): lot-tracked lines show the expected-lot field; untracked lines omit it. These use inventory fixtures, not live orders.

## Shared ownership

`components/mgr/screens.tsx` New PO and New PO incomplete → `components/mgr/views/new-po.tsx` NewPoView ← `app/(app)/purchase-orders/new-po-form.tsx` NewPoForm ← `app/(app)/purchase-orders/new/page.tsx`.

Both paths keep the full-page staff surface. The live adapter, command payload, authorization, touched-line rules, and optional-slot semantics are unchanged. Quantity now uses the same E.edit primitive directly so it can display a visible label and its own linked error. No schema, RPC, command, or API changed.

## Exercised verification

- Real local app: vendor/material selection, negative quantity error after blur, correction to 40.5 purchase units, Add line, removal of the incomplete line, enabled Save draft, successful save and redirect to the PO list showing PO-0001 · Country Malt · draft.
- Rendered inventory: three lines, expected lots on the two tracked materials, no expected-lot field on the untracked material.
- Flat-form browser smoke: negative quantity error after blur, correction to 2.5, Add line and Remove. At 320px, numeric groups are 288px wide and vertically separated; the page width is exactly 320px. Desktop and 390px phone screenshots were refreshed.
- Screen-only proof plus purchasing, form feedback, and composition checks: 263 tests across 10 files pass. TypeScript passes. ESLint exits zero with seven warnings in unchanged files.
- Simplification removes decorative wrappers and copy without changing option lists, command callbacks, validation, or footer suppression. Line regions and Remove buttons retain nonvisual line numbers for assistive technology.

The responsive review finding was fixed by using one column below 390px, two columns up to 1023px, and three columns from 1024px. No parity-debt entry was added or removed.
