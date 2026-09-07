# Drift

Unresolved contradictions or omissions in artifacts the dreaming agent cannot
edit. Remove an item when the owning artifact is corrected.

- [ ] `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` §16.13 gives a `not_in_inventory` tap interval nominal yield but no beer identity when no brand exists behind it; PR #50 noted it is also absent from §16.16's open list.
- [ ] Taproom loss attribution (samples, taproom pours, and destroyed beer as distinct TTB removal types tied to a batch/lot, per `.agents/superpowers/specs/brewing-domain.md`) is still missing from the taproom variance screens. `components/mgr/screens.tsx` is now the source of truth for MGR frames (the wireframe file PR #50 cited is retired for this purpose, PR #58) — its "Variance by brand" record explains a POS-vs-count gap by named cause but never posts or classifies a removal type; still open (originally PR #50). Reconfirmed by PR #159's screen audit: Weekly count still books comps, staff drinks, and line cleaning as generic taxpaid depletion rather than a classified removal type.
- [ ] `components/mgr/screens.tsx`'s Team member sheet draws **Taproom** as a selectable staff role, but `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` §16.13 says it must not ship until per-role RLS policies exist for it (PR #159).
- [ ] Pick/ship in `screens.tsx` never records a finished-goods lot, yet the Lot trace screen promises per-customer recall (adversarial finding F18, `.agents/superpowers/specs/2026-09-04-adversarial-walkthrough-review.md`) (PR #159).
- [ ] `screens.tsx` draws commands with no entry in the UI-layout-plan §2 registry (`.agents/superpowers/specs/2026-08-31-mgr-ui-layout-plan.md`): `confirm_restock`, disconnect-QuickBooks, write-off, invoice-question, push-defaults. Either the plan's registry is missing these or the screens invented verbs it doesn't sanction (PR #159).
- [ ] `screens.tsx` disagrees with itself on invoice timing: Ship and invoice assumes the persisted-timing column already exists while Ship on delivery marks the same column `SCHEMA-GATE` (PR #159).
- [ ] Review order in `screens.tsx` shows a "Tax $0.00" line, but `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md` assigns tax computation to QuickBooks, not MGR (PR #159).
