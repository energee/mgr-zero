# MGR information-layout design snapshots

Design-only artifacts for issue planning under energee/mgr-zero#909. Source-audit baseline: b74c620869b7fa98e61b588ab36e8b183d8b2708 (main).

The `design/catalog-information-layouts-2026-10-16` tag adds the Catalog concept to the earlier `design/card-information-layouts-2026-10-16` asset snapshot. Both commits belong only to this design-artifact history, not application branch history. No app branch, product release, workflow, deployment configuration or hosted change is included. Do not merge this tree into main or base implementation branches on it.

## Catalog concept

- `mockups/catalog.html`: aligned whole-linked brand rows on desktop and whole-linked labeled phone cards.
- `mockups/catalog-desktop.png`: readable desktop panel.
- `mockups/catalog-mobile.png`: readable 390px phone panel.
- `mockups/catalog.png`: complete annotated concept board.
- `mockups/style.css`: shared conceptual styling using the existing MGR light palette.

Catalog keeps the current search/category/sort controls, separates name/optional staff alias from Style/ABV/SKUs, distinguishes missing facts from known zero, retains Formats as a comparison table, and groups Price groups/Water profiles separately. No readiness, stock, price or margin metrics are invented. Phone Formats has a deliberate internal-scroll treatment; the Catalog card container itself does not overflow.

The previous shared, Orders, Batches and Invoices HTML/PNG assets remain in `mockups/`. Their issue plans are #942–#945; the Catalog plan and all later decisions live in its linked issue under #909.

## Editing and verification limits

Serve the directory through a local static HTTP server to edit/re-render the HTML. No install is required. Data is fictional; system fonts substitute for product-loaded fonts; simplified chrome is not a shell redesign. Controls/anchors are illustrative and do not run queries or commands.

The Catalog board and desktop/phone panels were rendered in Chromium and visually inspected. PNG dimensions/signatures, four brand links in each layout, zero/missing/alias presentation, and phone-container versus internal Formats overflow were checked. These are proposed designs, not live-page screenshots, proof of functional filters/navigation, global parity certification or implemented behavior. The issue requires actual live/inventory/role/state/light-dark/keyboard/coarse-pointer and repository checks during implementation. No application regression suites, typecheck, lint, provider operation or deployment was run for this design delivery.
