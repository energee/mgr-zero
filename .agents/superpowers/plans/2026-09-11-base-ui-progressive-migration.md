# Base UI progressive migration

## Goal

Move shadcn primitives from Radix to Base UI without a preset-wide rewrite. Each phase must leave the application releasable and must preserve the shared screen inventory/live rendering boundary.

## Rules

- Migrate one shared `components/ui` primitive at a time, then update all of its consumers in the same change.
- Do not add compatibility wrappers for both APIs. Git history is the rollback path.
- Keep `components.json` on `radix-nova` until every installed primitive is migrated.
- Before each primitive, inventory imports and API differences with `rg`, `shadcn info`, and the current shadcn docs.
- For customer-visible changes, update the applicable guide and verify the inventory and live page in a browser.
- Gate every phase with its focused regression, `bunx tsc --noEmit`, `bun run lint`, and the repository's pure screen suite.

## Phases

### 1. Drawer pilot

- Replace Vaul with `@base-ui/react` in the shared Drawer.
- Preserve the composer’s minimized, compact, and expanded snap points, click handle, and drag-down behavior.
- Remove `vaul` after its final import is gone.

### 2. Leaf controls

Migrate `separator`, `label`, `switch`, and `slider` individually. These have small APIs and establish Base UI styling and form-state conventions with limited blast radius.

### 3. Selection controls

Migrate `toggle`, `toggle-group`, and `tabs`. Update controlled values at the consumer boundary; do not hide Base UI’s array/value differences in adapters.

### 4. Floating surfaces

Migrate `tooltip` and `popover`, then `select` as its own change. Verify keyboard navigation, focus return, collision placement, and mobile behavior. `select` requires a complete consumer inventory because Base UI uses root `items` and different placeholder semantics.

### 5. Modal surfaces

Migrate `dialog`, then `sheet`. Verify focus trapping, escape/pointer dismissal, nested forms, and every customer-visible entry flow in both inventory and live pages.

### 6. Composition layer

Migrate `button`, `badge`, `item`, `attachment`, `button-group`, and `sidebar` last because their trigger composition reaches the most consumers. Replace Radix `asChild` with Base UI `render` only at affected call sites.

### 7. Finalize

- Confirm `rg 'from "radix-ui"|from "vaul"'` returns no application imports.
- Switch `components.json` to `base-nova` and preview every installed component diff before accepting it.
- Remove `radix-ui`, run the full CI command set, and browser-check the primary staff, portal, docs, and composer flows.

## Done for each phase

The primitive has one implementation, all consumers use its native Base UI API, focused regressions pass, screen parity is retained, and the dependency removed by that phase has no remaining imports.
