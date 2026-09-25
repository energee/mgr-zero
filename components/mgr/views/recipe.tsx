// components/mgr/views/recipe.tsx — Recipe: the one editor. The inventory
// draws it static from a fixture; a cut version on the live page is the same
// drawing read-only (`readOnly`), its schedules read out inline as rows; the
// live draft (recipes/[id]/recipe-version-form.tsx) passes `controls` and the
// fields become controlled, the schedule and ingredient rows open their
// sheets through `slots`, and the bottom button submits. parentForm draws the
// recipe's parent fields (name, style, brand, note) where the parent row sits.
"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { RECIPE_NUMBERS, type RecipeNumberKey, type RecipeScheduleView, type RecipeViewModel } from "@/lib/mgr/recipe-view";

export type { RecipeViewModel };

export type RecipeControls = {
  set: (key: RecipeNumberKey | "notes", value: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  busy?: boolean;
  ready?: boolean;
  error?: string | null;
};
/** Rows that open a sheet on the live draft; each replaces the fixture's static row with the same row as trigger. */
export type RecipeSlots = { addIngredient?: ReactNode; mash?: ReactNode; fermentation?: ReactNode; water?: ReactNode };

export function RecipeView({
  model,
  parentForm,
  controls,
  readOnly = false,
  slots = {},
}: {
  model: RecipeViewModel;
  parentForm?: ReactNode;
  controls?: RecipeControls;
  /** A cut version: the same fields, disabled, so nothing looks editable that cannot be saved. */
  readOnly?: boolean;
  slots?: RecipeSlots;
}) {
  const bind = (key: RecipeNumberKey | "notes") =>
    controls ? { onChange: (value: string) => controls.set(key, value) } : readOnly ? { disabled: true } : undefined;
  // A schedule row: the live draft's sheet trigger, else a read-out of its rows on a cut version, else the row that opens its screen.
  const schedule = (s: RecipeScheduleView | undefined, slot: ReactNode) => {
    if (slot) return slot;
    if (!s) return null;
    if (!s.rows) return E.nav(s.title, s.detail);
    return <>{E.row(s.title, s.detail)}{s.rows.map((r, i) => <Fragment key={`${s.title}-${i}`}>{E.row(r.title, r.detail)}</Fragment>)}</>;
  };
  const head = (
    <>
      {parentForm ?? (model.parent ? E.row(model.parent.title, model.parent.detail) : null)}
      {model.priceGroupOptions
        ? <>
          {E.pick("Default price group · optional", model.priceGroup ?? "", model.priceGroupOptions)}
          {E.info("A pre-fill for the brand a batch packages into, nothing more. The version carries no price and no group; changing this cuts no new version.")}
        </>
        : E.gated("Default price group · optional", "arrives with a recipe price group; the brand’s group prices its SKUs today")}
    </>
  );
  const body = model.empty ? (
    <>
      {head}
      {E.blank(model.empty)}
      {E.btn("Create recipe version", "p", model.createHref)}
    </>
  ) : (
    <>
      {head}
      {(model.ingredients ?? []).map((row) => (
        <Fragment key={row.key}>{E.row(row.title, row.detail, row.action ?? row.qty)}</Fragment>
      ))}
      {slots.addIngredient ?? (readOnly ? null : E.row("+ add ingredient", "material · stage · timing", ""))}
      {E.cols(...RECIPE_NUMBERS.map(([key, label, bounds]) => E.edit(label, model[key] ?? "", "number", undefined, controls ? { ...bounds, ...bind(key) } : bind(key))))}
      {schedule(model.mash, slots.mash)}
      {schedule(model.fermentation, slots.fermentation)}
      {schedule(model.water, slots.water)}
      {E.edit("Notes", model.notes ?? "", "text", undefined, bind("notes"))}
      {model.predicted ? E.info(model.predicted) : null}
      {E.tape(model.tape ?? [])}
      {model.actualsNote ? E.note(model.actualsNote) : null}
      {controls ? (
        <>
          <CommandFormMessage error={controls.error} />
          <Button type="submit" className="w-full md:w-fit md:self-end" disabled={controls.busy || controls.ready === false}>{controls.busy ? "Saving…" : controls.submitLabel ?? "Create recipe version"}</Button>
        </>
      ) : E.btn("Create recipe version", "p", model.createHref)}
    </>
  );
  return (
    <>
      {E.back(model.backLabel ?? "Recipes", model.title, undefined, model.backHref)}
      {controls
        ? <form className="contents" onSubmit={(event) => { event.preventDefault(); if (!controls.busy && controls.ready !== false) controls.onSubmit(); }}>{body}</form>
        : body}
    </>
  );
}
