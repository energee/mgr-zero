# Catalog mockup: labeled Sort and Category selects

Design-only revision for energee/mgr-zero#965 under #909, source baseline b74c620869b7fa98e61b588ab36e8b183d8b2708. Tag: design/catalog-select-toolbar-2026-10-16. This extends only the separate design-artifact history; do not merge the snapshot into main.

Current concept: mockups/catalog-selects.html, catalog-selects-desktop.png, catalog-selects-mobile.png and catalog-selects.png, with shared style.css. Earlier snapshots remain historical. #965 embeds this revision.

Replace the two visible option rows with labeled Sort and Category selects. Desktop: one search/select toolbar. Phone: full-width search above two side-by-side selects, stacking at narrower available widths. The displayed selection is Name / All categories; Sort options remain Name, ABV, Newest, and categories remain the authorized returned names. All categories uses the existing empty query value. Existing search/name-or-alias matching, applied URL state, sort/category predicates and role scope are unchanged.

Implementation uses existing E.pick and shared ListControls rather than native selects or new custom product controls. Changing a selection follows the existing query destination, preserving the applied search/other selection, without an Apply step or new search-on-keystroke behavior. Other screens' navigation tabs remain unchanged. BRAND, its unlabeled secondary alias, and recorded COLA facts from prior revisions are preserved.

All data and TTB identifiers are fictional. The static closed-select illustrations are not functional product components. No actual filter, URL navigation, query, selection popup or accessibility behavior is demonstrated by the PNG. System fonts and simplified chrome remain conceptual substitutes.

Verification: Chromium desktop/phone renders were inspected; toolbar columns measured 558/150/180px at desktop and 172/172px below full-width phone search; no old option rows or whole-phone overflow remained. Current E.pick and Select documentation were checked. These are not live/inventory parity proof. No product code change, application test/typecheck/lint, database/provider/TTB operation, deployment or hosted configuration change is included. Actual implementation must exercise keyboard/touch, URL/Back/Forward, role/state/light-dark and repository proof requirements in #965.
