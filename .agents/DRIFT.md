# Drift

Unresolved contradictions or omissions in artifacts the dreaming agent cannot
edit. Remove an item when the owning artifact is corrected.

- [ ] `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` §16.13 gives a `not_in_inventory` tap interval nominal yield but no beer identity when no brand exists behind it; PR #50 noted it is also absent from §16.16's open list.
- [ ] Taproom loss attribution (samples, taproom pours, and destroyed beer as distinct TTB removal types tied to a batch/lot, per `.agents/superpowers/specs/brewing-domain.md`) is still missing from the taproom variance screens. `components/mgr/screens.tsx` is now the source of truth for MGR frames (the wireframe file PR #50 cited is retired for this purpose, PR #58) — its "Variance by brand" record explains a POS-vs-count gap by named cause but never posts or classifies a removal type; still open (originally PR #50).
