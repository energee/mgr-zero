// components/mgr/views/recipes.tsx — Recipes list, one header for inventory
// and live: a back to More and New recipe. The recipes are drawn by the shared
// RecordTable (Recipe, Version, Brand; #1516), each name opening its recipe,
// and a Water profiles row follows the list under its own Water heading. Live
// passes the back, create and Water profiles hrefs in the model, and linkRows
// so each name links its recipe; inventory leaves them for the explorer to resolve.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RecordTable } from "@/components/mgr/views/record-table";
import type { RecipesViewModel } from "@/lib/mgr/recipes-view";
import { WATER_PROFILES_CAPTION } from "@/lib/mgr/water-profiles-view";

export function RecipesView({ model, controls, linkRows }: {
  model: RecipesViewModel;
  /** The search strip (components/mgr/list-controls.tsx). */
  controls?: ReactNode;
  /** Live: each name links its recipe. Inventory leaves names inert taps, as Customers does. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.back("More", "Recipes", E.btn("New recipe", "p", model.createHref), model.backHref)}
      {controls}
      {model.empty
        ? E.blank(model.empty)
        : <RecordTable
          headers={["Recipe", "Version", "Brand"]}
          align={["l", "l", "l"]}
          rows={model.rows.map((row) => ({
            key: row.key,
            href: linkRows ? row.href : undefined,
            to: "Recipe",
            cells: [
              row.name,
              row.version === null ? <span key="version" className="text-warning-foreground">No version yet</span> : `v${row.version}`,
              row.brand ?? <span key="brand" className="text-muted-foreground">No brand yet</span>,
            ],
            // A missing version or brand sorts last rather than by its words.
            sort: [row.name, row.version, row.brand],
          }))}
        />}
      {/* A heading, so the row reads as its own destination and not as a recipe named Water profiles. */}
      {E.ttl("Water")}
      {E.nav("Water profiles", WATER_PROFILES_CAPTION, "", undefined, model.waterProfilesHref)}
    </>
  );
}
