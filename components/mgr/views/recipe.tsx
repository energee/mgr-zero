// components/mgr/views/recipe.tsx — Recipe: the one brewsheet. It reads top to
// bottom as the brew day runs (RECIPE_SECTIONS): each step draws its process
// numbers, the ingredients used there, an add row and its schedule. The
// inventory draws it static from a fixture. The live editor
// (recipes/[id]/recipe-version-form.tsx) passes `controls`: the fields become
// controlled, the schedule, ingredient and add rows open their sheets through
// `slots`, and a save bar (what is still needed, Discard, Save changes) sticks
// to the bottom only while `controls.dirty`. An earlier copy (`readOnly`) is a
// read-out: its numbers and change note as label/value text, its schedules as
// rows under their headings, `asBrewed` naming the batches that brewed it and
// Use this again in the title row. Otherwise the title row holds Schedule
// batch (to New batch on Batches) once the recipe is saved and has no unsaved
// change. parentForm draws the recipe's parent fields (name, brand and note)
// at the top. Show totals at is a page-only batch size, never saved: typed,
// each brew-day line shows its batch total in packs, and off a read-out each
// line not in whole packs offers "Round to N × size", down and up. Batch
// actuals follows the sheet: what brewed batches measured, predictions in
// brackets, and the gap for the shown copy. It is drawn only with a tape. As
// brewed comes last: the earlier copies batches brewed, each opening read
// only. The page never says "version".
"use client";
import { Fragment, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { isNumber } from "@/lib/mgr/quantity-input";
import type { IngredientStage } from "@/lib/mgr/recipe-process-view";
import { batchTotalText, packRounding, RECIPE_NUMBERS, RECIPE_SECTIONS, type RecipeIngredientView, type RecipeNumberKey, type RecipeScheduleView, type RecipeSection, type RecipeViewModel } from "@/lib/mgr/recipe-view";

export type RecipeControls = {
  set: (key: RecipeNumberKey | "notes", value: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  busy?: boolean;
  /** What the draft still needs before it can be saved (draftBlocker); set means the submit is disabled. */
  blockedReason?: string | null;
  error?: string | null;
  /** The sheet differs from what is saved, or the recipe is still being created; the save bar is drawn only then. */
  dirty: boolean;
  /** Puts the sheet back to what is saved. Without it the bar has no Discard: a recipe being created has nothing to go back to. */
  onDiscard?: () => void;
};
/** The live editor's sheets. Each schedule slot replaces the fixture's static row with the same row as trigger.
 *  addIngredient takes a step's first stage and that step's add row, and returns the Ingredient sheet the row opens. */
export type RecipeSlots = { addIngredient?: (stage: IngredientStage, trigger: ReactNode) => ReactNode; mash?: ReactNode; fermentation?: ReactNode; water?: ReactNode };

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
  /** A saved copy read out: numbers and notes as text, schedules as rows, nothing that edits it (Show totals at only sizes the totals). */
  readOnly?: boolean;
  slots?: RecipeSlots;
}) {
  const [totalsAt, setTotalsAt] = useState(model.totalsAtBbl ?? "");
  // Exponent notation such as 1e1 is not a batch size: the field shows why, and no totals are drawn.
  const bbl = isNumber(totalsAt) ? Number(totalsAt) : 0;
  const lines = model.ingredients ?? [];
  const packed = lines.some((row) => row.pack);
  // A brew-day line's total at the typed size, then Whole packs or (off a read-out) its Round choices.
  const packFoot = ({ pack, onRound }: RecipeIngredientView) => {
    if (!pack || !(bbl > 0)) return undefined;
    const rounding = packRounding(pack, bbl);
    return (
      <>
        <span className="text-sm">{bbl} bbl {E.arrow()} {batchTotalText(pack, bbl)}</span>
        {rounding?.whole ? <span>{E.status("Whole packs", "ok")}</span> : null}
        {rounding && !readOnly && rounding.choices.length ? (
          <div className="flex flex-col gap-2 md:flex-row md:justify-end">
            {rounding.choices.map((c) => <Fragment key={c.label}>{E.btn(c.label, "g", undefined, onRound ? () => onRound(c.perBbl) : undefined)}</Fragment>)}
          </div>
        ) : null}
      </>
    );
  };
  const bind = (key: RecipeNumberKey | "notes") => (controls ? { onChange: (value: string) => controls.set(key, value) } : undefined);
  // A step's schedule: the live editor's sheet trigger, else its rows and summary on a read-out (one row is its own summary,
  // so it is not repeated; a title that only repeats the step's heading is not drawn), else the row that opens its screen.
  const schedule = (s: RecipeScheduleView | undefined, slot: ReactNode, heading: string) => {
    if (slot) return slot;
    if (!s) return null;
    if (!s.rows) return E.nav(s.title, s.detail);
    return (
      <>
        {s.title === heading ? null : E.ttl(s.title)}
        {s.rows.map((r, i) => <Fragment key={`${s.title}-${i}`}>{E.row(r.title, r.detail)}</Fragment>)}
        {s.detail && s.rows.length > 1 ? E.info(s.detail) : null}
      </>
    );
  };
  // One step of the brew day: its heading, its process numbers, the ingredients used there, the row that adds one, and its schedule.
  const step = ({ key, title, stages, numbers }: RecipeSection) => {
    const rows = lines.filter((row) => stages.includes(row.stage));
    // A read-out prints only the numbers the copy holds; the editor draws every field.
    const fields = RECIPE_NUMBERS.filter(([number]) => numbers.includes(number) && (!readOnly || model[number]));
    const plan = key === "water" || key === "mash" || key === "fermentation" ? schedule(model[key], slots[key], title) : null;
    // A read-out skips a step the copy says nothing about. The editor draws every step, and Packaging and other once it has a line.
    if (readOnly ? !(fields.length || rows.length || plan) : key === "other" && rows.length === 0) return null;
    const add = stages.length && !readOnly ? E.row(`Add ${title.toLowerCase()} ingredient`, "Material, amount and timing", "") : null;
    return (
      <Fragment key={key}>
        {E.group(title)}
        {readOnly ? fields.map(([number, label]) => <Fragment key={number}>{E.fld(label, model[number])}</Fragment>) : null}
        {!readOnly && fields.length ? E.cols(...fields.map(([number, label, bounds]) => E.edit(label, model[number] ?? "", "number", undefined, controls ? { ...bounds, ...bind(number) } : undefined))) : null}
        {rows.map((row) => <Fragment key={row.key}>{E.row(row.title, row.detail, row.action ?? row.qty, "", undefined, packFoot(row))}</Fragment>)}
        {add && slots.addIngredient ? slots.addIngredient(stages[0], add) : add}
        {plan}
      </Fragment>
    );
  };
  const body = (
    <>
      {model.asBrewed ? null : parentForm}
      {model.priceGroupOptions
        ? <>
          {E.pick("Default price group · optional", model.priceGroup ?? "", model.priceGroupOptions)}
          {E.info("A pre-fill for the brand a batch packages into, nothing more. The recipe carries no price and no group; changing this does not change the recipe.")}
        </>
        : null}
      {model.recipeNote ? E.row("Recipe note", model.recipeNote) : null}
      {model.saved ? E.fld("Saved", model.saved) : null}
      {model.asBrewed ? E.note(model.asBrewed) : null}
      {/* Always mounted and polite: the prediction and IBU change as the sheet is typed,
          and an alert (E.info is one) would interrupt the screen reader on every keystroke. */}
      <div role="status">{E.polite(model.predicted)}{E.polite(model.bitterness)}</div>
      {packed ? (
        <>
          {E.edit("Show totals at (bbl)", totalsAt, "number", undefined, { onChange: setTotalsAt, min: 0 })}
          {bbl > 0 ? null : E.polite("Enter a batch size to see totals in packs.")}
        </>
      ) : null}
      {RECIPE_SECTIONS.map(step)}
      {readOnly
        ? (model.notes ? E.fld("Change note", model.notes) : null)
        : E.edit("Change note · optional", model.notes ?? "", "text", undefined, bind("notes"))}
      {model.tape?.length ? <>{E.ttl("Batch actuals · predicted in brackets")}{E.tape(model.tape)}</> : null}
      {model.actualsNote ? E.info(model.actualsNote) : null}
      {model.history?.length ? (
        <>
          {E.ttl("As brewed")}
          {/* The copy being shown is named, not linked to itself. */}
          {model.history.map((h, i) => <Fragment key={i}>{h.selected ? E.row(h.title, h.detail, "Shown") : E.nav(h.title, h.detail, "", undefined, h.href, "Recipe")}</Fragment>)}
        </>
      ) : null}
      {controls?.dirty ? (
        // Stuck to the bottom of the page's scroll at every width, so the verb is in reach wherever the change was made.
        // The negative offsets reach the page column's padding (app-shell: p-4, md:px-8 md:py-6), as BrewFooter's do on the phone.
        <div className="sticky -bottom-4 z-10 -mx-4 flex flex-col gap-2 border-t bg-background px-4 py-3 md:-bottom-6 md:-mx-8 md:flex-row md:items-center md:justify-end md:px-8">
          <div role="status">{E.polite(controls.blockedReason)}</div>
          <CommandFormMessage error={controls.error} />
          {controls.onDiscard ? E.btn("Discard", "g", undefined, controls.onDiscard) : null}
          <Button type="submit" className="w-full md:w-fit" disabled={controls.busy || Boolean(controls.blockedReason)}>{controls.busy ? "Saving…" : controls.submitLabel ?? "Save changes"}</Button>
        </div>
      ) : null}
    </>
  );
  // The title row holds one verb: Use this again on an earlier copy, else Schedule batch (#1581) once the recipe is saved.
  // Schedule batch gives way to the save bar while a change is unsaved, because it would schedule what is saved, not what is on screen.
  let verb: ReactNode;
  if (model.asBrewed) verb = E.btn("Use this again", "p", model.useAgainHref);
  else if (model.saved && !controls?.dirty) verb = E.btn("Schedule batch", "g", model.scheduleHref);
  return (
    <>
      {E.back(model.backLabel ?? "Recipes", model.title, verb, model.backHref)}
      {controls
        ? <form className="contents" onSubmit={(event) => { event.preventDefault(); if (controls.dirty && !controls.busy && !controls.blockedReason) controls.onSubmit(); }}>{body}</form>
        : body}
    </>
  );
}
