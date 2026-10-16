# MGR information-layout mockups

Design-only snapshot requested for the information-card planning issues under energee/mgr-zero#909. Source audit baseline: b74c620869b7fa98e61b588ab36e8b183d8b2708 (main).

This snapshot has its own root commit and a `design/card-information-layouts-2026-10-16` tag. It contains design artifacts only, with no application, workflows, release or deployment configuration. Do not merge it into main or use it as an application branch base. The tag keeps issue image URLs durable without creating an app preview branch or a product release.

## Files

- `mockups/shared.html`: stock comparison, mixed task and quiet navigation patterns; these are separate pages, not a combined dashboard.
- `mockups/orders.html`: desktop order register and phone records.
- `mockups/batches.html`: batch register and nested occupancy readings, including missing values and multiple occupancies.
- `mockups/invoices.html`: invoice identity, totals, balances, due/payment and accounting state.
- `mockups/style.css`: shared conceptual styling using the existing MGR light palette.
- `mockups/*-desktop.png`, `mockups/*-mobile.png`: independently readable captured panels for issue embedding.
- `mockups/shared.png`, `orders.png`, `batches.png`, `invoices.png`: full annotated concept boards.
Implementation plans and the route-family rollout ledger live in the linked GitHub issues under #909; the issue discussion is authoritative for later design decisions.

Open the HTML through a local static HTTP server to edit/re-render. No dependency install is required. All data is fictional. Controls are illustrative and do not run commands; system fonts substitute for product-loaded fonts. Simplified chrome does not propose a navigation/shell redesign. These are concepts, not live-page screenshots, architectural parity proof, accessibility certification or implemented product behavior.

Verification performed for this design delivery: all four HTML boards rendered in Chromium, full-board and desktop/phone-panel PNGs captured and visually inspected; PNG signatures/dimensions checked. Existing source adapters/shared components were inspected/exercised during the preceding read-only audit. No application regression suites, typecheck, lint, provider operation or deployment was run as part of creating these artifacts. Future implementation issue acceptance requires the actual live/inventory, role/state, light/dark, keyboard/coarse-pointer and repository proof checks.
