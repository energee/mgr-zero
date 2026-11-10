// components/mgr/views/recipe.tsx — Recipe: the one brewsheet. Under the title
// sit the headline figures (OG, FG, ABV, IBU) with what they leave unsaid, and
// Show totals at, a page-only batch size that is never saved. The sheet then
// reads top to bottom as the brew day runs (RECIPE_SECTIONS). Each step is one
// heading line (its process numbers beside it under their labels, its actions at the end) over a
// compact table of the ingredients used there, then its schedule listed row by
// row under its count and summary. A line reads its amount per bbl and its
// timing in columns; it names its stage only where the step's heading does not
// (a dry hop under Fermentation). With a batch size typed, each brew-day line
// adds its total in packs, and off a read-out each line not in whole packs
// offers "Round to N × size", down and up. The inventory draws it static from
// a fixture. The live editor (recipes/[id]/recipe-version-form.tsx) passes
// `controls`: the fields become controlled, a line's name, a step's Add
// ingredient and its Edit schedule open their sheets through `edit` and
// `slots`, and a save bar (what is still needed, Discard, Save changes) sticks
// to the bottom only while `controls.dirty`. `controls.refresh` offers Refresh
// from Materials under the figures. An earlier copy (`readOnly`) is a
// read-out: numbers and change note as text, nothing that edits it, `asBrewed`
// naming the batches that brewed it and Use this again in the title row.
// Otherwise the title row holds Schedule batch (to New batch on Batches) once
// the recipe is saved and has no unsaved change. parentForm draws the recipe's
// parent fields (name, brand and note) at the top. Batch actuals follows the
// sheet: what brewed batches measured, predictions in brackets, and the gap
// for the shown copy. It is drawn only with a tape. As brewed comes last: the
// earlier copies batches brewed, each opening read only. The page never says
// "version".
"use client";
import { Fragment, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { sentenceCase } from "@/lib/mgr/labels";
import { isNumber } from "@/lib/mgr/quantity-input";
import type { IngredientStage } from "@/lib/mgr/recipe-process-view";
import { batchTotalText, packRounding, RECIPE_NUMBERS, RECIPE_SECTIONS, type RecipeIngredientView, type RecipeNumberKey, type RecipeSection, type RecipeViewModel } from "@/lib/mgr/recipe-view";

/** The steps that hold a schedule; the model carries one under the same key. */
type ScheduleKey = "water" | "mash" | "fermentation";
/** A table is as wide as its longest cell and scrolls sideways past the column, so on the phone a long name or summary wraps instead (as E.brand does). */
const wrap = (text: ReactNode) => <span className="inline-block max-w-36 whitespace-normal md:max-w-none">{text}</span>;

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
  /** Set while the unchanged sheet would predict other figures from current Materials (materialsNowGive): the line
   *  saying so, and the save that freezes them. */
  refresh?: { text: string; onRefresh: () => void };
};
/** The live editor's sheets. Each takes the action the view drew and returns the sheet that action opens:
 *  addIngredient for a step's Add ingredient (with the step's first stage), schedule for its Edit schedule. */
export type RecipeSlots = { addIngredient?: (stage: IngredientStage, trigger: ReactNode) => ReactNode; schedule?: (key: ScheduleKey, trigger: ReactNode) => ReactNode };

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
  const bind = (key: RecipeNumberKey | "notes") => (controls ? { onChange: (value: string) => controls.set(key, value) } : undefined);
  // A line's name. On the sheet it opens the line's Ingredient sheet; the fixture draws the same button static.
  const name = (row: RecipeIngredientView) => {
    if (readOnly) return wrap(row.title);
    const trigger = <Button type="button" variant="link" className="h-auto p-0 text-left">{wrap(<><span className="sr-only">Edit </span>{row.title}</>)}</Button>;
    return row.edit ? row.edit(trigger) : trigger;
  };
  // A brew-day line's total at the typed size, then Whole packs or (off a read-out) its Round choices.
  const total = ({ pack, onRound }: RecipeIngredientView) => {
    if (!pack) return "";
    const rounding = packRounding(pack, bbl);
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="flex items-center gap-2">{batchTotalText(pack, bbl)}{rounding?.whole ? E.status("Whole packs", "ok") : null}</span>
        {rounding && !readOnly && rounding.choices.length ? (
          <div className="flex flex-col gap-1 md:flex-row">
            {rounding.choices.map((c) => <Fragment key={c.label}>{E.btn(c.label, "g", undefined, onRound ? () => onRound(c.perBbl) : undefined)}</Fragment>)}
          </div>
        ) : null}
      </div>
    );
  };
  // One step of the brew day: a heading line with its process numbers and actions, the ingredients used there, and its schedule.
  const step = ({ key, title, stages, numbers }: RecipeSection) => {
    const rows = lines.filter((row) => stages.includes(row.stage));
    // A read-out prints only the numbers the copy holds; the editor draws every field.
    const fields = RECIPE_NUMBERS.filter(([number]) => numbers.includes(number) && (!readOnly || model[number]));
    const scheduleKey = key === "water" || key === "mash" || key === "fermentation" ? key : undefined;
    // A read-out lists a schedule only when the copy holds one.
    const plan = scheduleKey && model[scheduleKey] && (!readOnly || model[scheduleKey].rows.length) ? model[scheduleKey] : undefined;
    // A read-out skips a step the copy says nothing about. The editor draws every step, and Packaging and other once it has a line.
    if (readOnly ? !(fields.length || rows.length || plan) : key === "other" && rows.length === 0) return null;
    // The heading already names a line's stage when they match; a stage sharing the step (dry hop under Fermentation) names itself beside its timing.
    const when = (row: RecipeIngredientView) => (sentenceCase(row.stage) === title ? row.timing : [sentenceCase(row.stage), row.timing].filter(Boolean).join(" · "));
    const timed = rows.some(when);
    const totals = bbl > 0 && rows.some((row) => row.pack);
    // Each action says its step after its words, for a screen reader and the inventory's tap map; the heading beside it says it on screen.
    const add = stages.length && !readOnly ? <Button type="button" variant="outline" size="sm">Add ingredient<span className="sr-only"> to {title.toLowerCase()}</span></Button> : null;
    const edit = plan && scheduleKey && !readOnly
      ? <Button type="button" variant="outline" size="sm">{scheduleKey === "water" ? "Edit water" : <>Edit schedule<span className="sr-only"> for {title.toLowerCase()}</span></>}</Button>
      : null;
    return (
      <section key={key} className="flex flex-col gap-1">
        {/* The heading sits level with the steppers beside it, which stand under their labels. */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div className="pb-1.5">{E.group(title)}</div>
          {fields.map(([number, label, bounds]) => (
            <div key={number}>
              {readOnly ? E.fld(label, model[number]) : E.edit(label, model[number] ?? "", "number", undefined, controls ? { ...bounds, ...bind(number) } : undefined)}
            </div>
          ))}
          {add || edit ? (
            <div className="ml-auto flex gap-2">
              {add && slots.addIngredient ? slots.addIngredient(stages[0], add) : add}
              {edit && scheduleKey && slots.schedule ? slots.schedule(scheduleKey, edit) : edit}
            </div>
          ) : null}
        </div>
        {rows.length ? E.tbl(
          ["Ingredient", "Per bbl", ...(timed ? ["Timing"] : []), ...(totals ? [`At ${bbl} bbl`] : [])],
          rows.map((row) => [name(row), row.amount, ...(timed ? [when(row)] : []), ...(totals ? [total(row)] : [])]),
          ["l", "r", "r", "r"], { sortable: false, dense: true },
        ) : null}
        {/* The schedule's count and summary head its rows. One row is its own summary, so it is not said twice (#1518). */}
        {plan ? E.tbl([plan.title, plan.rows.length === 1 ? "" : wrap(plan.detail)], plan.rows.map((r) => [wrap(r.title), wrap(r.detail)]), ["l", "r"], { sortable: false, dense: true }) : null}
      </section>
    );
  };
  const figures = model.figures ?? [];
  const body = (
    <>
      {model.asBrewed ? E.note(model.asBrewed) : parentForm}
      {model.priceGroupOptions
        ? <>
          {E.pick("Default price group · optional", model.priceGroup ?? "", model.priceGroupOptions)}
          {E.info("A pre-fill for the brand a batch packages into, nothing more. The recipe carries no price and no group; changing this does not change the recipe.")}
        </>
        : null}
      {E.polite([model.saved && `Saved ${model.saved}`, model.recipeNote].filter(Boolean).join(" · "))}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="min-w-0 flex-1">
          {/* Always mounted and polite: the figures change as the sheet is typed,
              and an alert (E.info is one) would interrupt the screen reader on every keystroke. */}
          <div role="status">
            {figures.length ? <div className="mb-1 flex flex-wrap gap-x-8 gap-y-2">{figures.map(([value, label]) => <Fragment key={label}>{E.num(value, label)}</Fragment>)}</div> : null}
            {model.figureNotes?.map((note) => <Fragment key={note}>{E.polite(note)}</Fragment>)}
          </div>
        </div>
        {packed ? (
          // Page-only, never saved: Enter here must not submit the sheet around it.
          <div className="flex shrink-0 flex-col gap-1" onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}>
            {E.edit("Show totals at (bbl)", totalsAt, "number", undefined, { onChange: setTotalsAt, min: 0 })}
            {bbl > 0 ? null : E.polite("Enter a batch size to see totals in packs.")}
          </div>
        ) : null}
      </div>
      {controls?.refresh ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {E.polite(controls.refresh.text)}
          <Button type="button" variant="outline" size="sm" disabled={controls.busy} onClick={controls.refresh.onRefresh}>Refresh from Materials</Button>
        </div>
      ) : null}
      {/* With no unsaved change there is no save bar, so a failed refresh or an unreadable kept change says so here. */}
      {controls && !controls.dirty ? <CommandFormMessage error={controls.error} /> : null}
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
