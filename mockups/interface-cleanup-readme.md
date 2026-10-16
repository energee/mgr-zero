# Interface cleanup mockups — 2026-10-16

Design assets for the next six slices under MGR issue #909. These are static proposed interfaces with fictional values, not screenshots of shipped application behavior. They do not execute queries, commands, provider actions, navigation, autosave, or request recovery.

| Slice | Editable source | Desktop | Phone | Annotated board | Issue disposition |
| --- | --- | --- | --- | --- | --- |
| Keg event history | [HTML](cleanup-keg-history.html) | [Image](cleanup-keg-history-desktop.png) | [Image](cleanup-keg-history-mobile.png) | [Board](cleanup-keg-history.png) | New focused subissue |
| Location scope: Count, Tap board, Variance, Replenishment | [HTML](cleanup-location.html) | [Image](cleanup-location-desktop.png) | [Image](cleanup-location-mobile.png) | [Board](cleanup-location.png) | New focused subissue |
| Orders status and customer scope | [HTML](cleanup-orders.html) | [Image](cleanup-orders-desktop.png) | [Image](cleanup-orders-mobile.png) | [Board](cleanup-orders.png) | Amendment to #943, not a duplicate |
| Record keg event | [HTML](cleanup-keg-event.html) | [Image](cleanup-keg-event-desktop.png) | [Image](cleanup-keg-event-mobile.png) | [Board](cleanup-keg-event.png) | New focused subissue |
| Invoices connection/manual-sync header | [HTML](cleanup-invoices.html) | [Image](cleanup-invoices-desktop.png) | [Image](cleanup-invoices-mobile.png) | [Board](cleanup-invoices.png) | Amendment to #945, not a duplicate |
| Settings grouping and independent saves | [HTML](cleanup-settings.html) | [Image](cleanup-settings-desktop.png) | [Image](cleanup-settings-mobile.png) | [Board](cleanup-settings.png) | New focused subissue |

## Rendering

Serve this directory over HTTP. `cleanup.css` imports `style.css`; the invoice concept keeps `style.css` with narrowly scoped header additions. Each board contains a 962px desktop panel and a 390px phone panel. The phone images are full scrollable content, not a claim that all content fits one handset viewport. Alternate-state insets are explicitly separate examples, not simultaneous active states.

## Implementation boundaries

- Reuse existing shared inventory/live views and E controls. A visually similar live-only fork does not satisfy the plan.
- Selects are for bounded choices; existing searchable pickers remain appropriate for customers and model/timezone catalogs. Work navigation remains navigation, not a status filter.
- Preserve each route's authorized data, URL scope, permissions, missing-value meanings and existing draft/request-recovery behavior. A shared-looking location control does not imply a shared save policy.
- Do not invent balances, actor identities, model IDs/pricing, provider freshness, connection health, or successful command results. Existing intended explorer facts without a live contract remain explicit/gated prerequisites, not silently erased to match a thinner payload.
- Source baseline reviewed: `b74c620869b7fa98e61b588ab36e8b183d8b2708`. Detailed source links, implementation steps and acceptance criteria live in the linked GitHub issues.

These files belong to an isolated design-only Git history/tag. No application implementation, dependency, migration, deployment, or infrastructure change is included.
