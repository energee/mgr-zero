# Catalog mockup: Brand, unlabeled alias and COLA records

Design-only revision for energee/mgr-zero#965 under #909. Source baseline: b74c620869b7fa98e61b588ab36e8b183d8b2708. Tag: design/catalog-brand-alias-2026-10-16. The snapshot extends the preceding design-only history, not the application branch. Do not merge it into main.

Current files: mockups/catalog-alias.html, catalog-alias-desktop.png, catalog-alias-mobile.png, catalog-alias.png and shared style.css. Earlier mockups remain historical; #965 embeds this revision.

Owner-requested correction: the header is BRAND, the optional alias is plain secondary text beneath the brand name without a Staff alias/Alias prefix, and the search control reads Search brands or aliases. Existing list_brands already searches name OR alias with a case-insensitive contains predicate, literal wildcard escaping and the existing category/sort/tenant/role scope (lib/commands/catalog.ts:346–355). The issue explicitly preserves that behavior; no search implementation or index is introduced. Alias remains restricted to staff surfaces.

All preceding COLA, metadata, formats, configuration and whole-linked navigation decisions are preserved. Data and TTB identifiers are fictional. Controls and anchors are illustrative, not working live search/navigation. Existing palette/system-font substitutes and simplified chrome remain conceptual.

Verification: Chromium rendered desktop/390px phone panels were visually inspected; the rendered header reads BRAND, both alias lines read Pilot #07 without a prefix, both search labels mention aliases, and no whole-phone overflow was measured. Name/alias search behavior was source-checked, not live-query tested. No application code, tests/typecheck/lint, database/provider/TTB operation, workflow, release, deploy or hosted configuration change is included. Future implementation must meet the actual live/inventory and repository proof requirements in #965.
