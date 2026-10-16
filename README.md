# Catalog information-layout concepts with COLA records

Design-only artifacts for energee/mgr-zero#965 under #909. Source baseline: b74c620869b7fa98e61b588ab36e8b183d8b2708 (main). The `design/catalog-cola-information-2026-10-16` tag extends the prior design-only Catalog snapshot. This history is separate from application branches. No application code, workflow, deployment configuration, release or hosted change is included; do not merge this asset tree into main.

## Current Catalog concept

- `mockups/catalog-cola.html`: Catalog with a separate recorded-COLA column on desktop and labeled approval block on phone.
- `mockups/catalog-cola-desktop.png`, `mockups/catalog-cola-mobile.png`: readable issue panels.
- `mockups/catalog-cola.png`: full annotated concept board.
- `mockups/style.css`: existing conceptual palette/styles.

Earlier Catalog, shared, Orders, Batches and Invoices sources/images are retained as historical design artifacts. #965's current issue body embeds this COLA revision and is authoritative for implementation decisions.

The revised concept shows No COLA on file, one saved approval with TTB ID/date, multiple approvals with all records available on Brand, and a saved approval with missing date and a leading-zero identifier. Formula approvals and registrations do not count as COLAs. Applicant serial is not the TTB ID. On file describes saved MGR records, not live TTB verification, pending/rejected/exempt status or permission to sell.

The existing Catalog route does not currently load approval records. The issue explicitly adds one existing authorized get_compliance_registry read at the page/query boundary, joined by brand ID; it does not add a query definition, schema, permission, per-brand read loop or live TTB lookup. Existing Brand approval forms and explicit TTB search/public-link behavior remain unchanged. Failed/unavailable reads cannot silently become No COLA on file.

All data and TTB identifiers are fictional. Controls/anchors are illustrative. System fonts and simplified chrome are conceptual substitutes. Render the HTML through a local static HTTP server for editing; no dependency installation is required.

Verification for this design delivery: source approval kinds/permissions/TTB identity semantics inspected; Chromium renders and final desktop/phone panels visually checked; rendered counts/IDs/dates and absence of nested links inspected; no whole-phone overflow measured. These are not live-page or implementation/parity proof. No application tests/typecheck/lint, TTB call, provider operation or deployment was run. Actual implementation must meet #965's live/inventory/role/state/light-dark/keyboard/coarse-pointer and repository proof requirements.
