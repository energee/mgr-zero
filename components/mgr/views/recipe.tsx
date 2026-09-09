// components/mgr/views/recipe.tsx — Recipe. Live slots read-only facts and
// NewVersionForm; inventory draws the gated editor.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { RecipeViewModel } from "@/lib/mgr/recipe-view";

export type { RecipeViewModel };

export function RecipeView({
  model,
  createAction,
  detail,
}: {
  model: RecipeViewModel;
  createAction?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <>
      {E.back("Recipes", model.title, createAction, model.backHref)}
      {detail ?? (
        <>
          {model.parent ? E.row(model.parent.title, model.parent.detail, E.act("Create")) : null}
          {E.pick("Default price group · optional", model.priceGroup ?? "", model.priceGroupOptions ?? [])}
          {E.info("A pre-fill for the brand a batch packages into, nothing more. The version carries no price and no group; changing this cuts no new version.")}
          {E.chips(["per bbl", "15 bbl", "30 bbl"], model.scaleIndex ?? 0)}
          {(model.ingredients ?? []).map((row) => (
            <Fragment key={row.key}>{E.row(row.title, row.detail, row.qty)}</Fragment>
          ))}
          {E.row("+ add ingredient", "material · stage · timing", "")}
          {E.cols(
            E.edit("Pre-boil volume bbl", model.preBoil ?? "", "number"),
            E.edit("Boil time min", model.boilMin ?? "", "number"),
          )}
          {E.cols(
            E.edit("Whirlpool min", model.whirlpoolMin ?? "", "number"),
            E.edit("Whirlpool temp °F", model.whirlpoolTemp ?? "", "number"),
          )}
          {E.cols(
            E.edit("Whirlpool rest min", model.whirlpoolRest ?? "", "number"),
            E.edit("Knockout temp °F", model.knockoutTemp ?? "", "number"),
          )}
          {E.cols(
            E.edit("Brewhouse efficiency %", model.efficiency ?? "", "number"),
            E.edit("Yeast attenuation %", model.attenuation ?? "", "number"),
          )}
          {model.mash ? E.nav(model.mash.title, model.mash.detail) : null}
          {model.fermentation ? E.nav(model.fermentation.title, model.fermentation.detail) : null}
          {model.water ? E.nav(model.water.title, model.water.detail) : null}
          {E.edit("Notes", model.notes ?? "")}
          {model.predicted ? E.info(model.predicted) : null}
          {E.tape(model.tape ?? [])}
          {model.actualsNote ? E.note(model.actualsNote) : null}
          {E.gated("Create recipe version", "isn’t available yet: assumptions have no columns to live in. A brewery with no version cannot schedule a batch, so brew day waits on this too")}
        </>
      )}
    </>
  );
}
