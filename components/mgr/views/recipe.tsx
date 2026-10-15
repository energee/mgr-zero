// components/mgr/views/recipe.tsx — Recipe: the one editor. The inventory
// draws it static from a fixture. A cut version on the live page (`readOnly`)
// is a read-out: its numbers and version note as label/value text, its
// schedules as rows under their headings. The live draft
// (recipes/[id]/recipe-version-form.tsx) passes `controls`: the fields become
// controlled, the schedule and ingredient rows open their sheets through
// `slots`, the bottom button submits, and `controls.blocked` says what the
// draft still lacks. Without `controls`, Create recipe version sits in the
// title row. parentForm draws the recipe's parent fields (name, style, brand,
// note) at the top.
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
  /** What the draft still needs before it can be saved (draftBlocker); set means the submit is disabled. */
  blocked?: string | null;
  error?: string | null;
};
/** Rows that open a sheet on the live draft; each replaces the fixture's static row with the same row as trigger. */
export type RecipeSlots = { addIngredient?: ReactNode; mash?: ReactNode; fermentation?: ReactNode; water?: ReactNode };

/** Plain muted text for a polite status region; E.info is an alert and would interrupt the screen reader. */
const statusText = (t: ReactNode) => (t ? <p className="text-sm text-muted-foreground">{t}</p> : null);

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
  /** A cut version: numbers and notes read out as text, schedules as rows, nothing that looks editable. */
  readOnly?: boolean;
  slots?: RecipeSlots;
}) {
  const bind = (key: RecipeNumberKey | "notes") => (controls ? { onChange: (value: string) => controls.set(key, value) } : undefined);
  // A schedule: the live draft's sheet trigger, else its heading, rows and summary on a cut version, else the row that opens its screen.
  const schedule = (s: RecipeScheduleView | undefined, slot: ReactNode) => {
    if (slot) return slot;
    if (!s) return null;
    if (!s.rows) return E.nav(s.title, s.detail);
    return (
      <>
        {E.ttl(s.title)}
        {s.rows.map((r, i) => <Fragment key={`${s.title}-${i}`}>{E.row(r.title, r.detail)}</Fragment>)}
        {s.detail ? E.info(s.detail) : null}
      </>
    );
  };
  const numbers = readOnly
    ? RECIPE_NUMBERS.filter(([key]) => model[key]).map(([key, label]) => <Fragment key={key}>{E.fld(label, model[key])}</Fragment>)
    : E.cols(...RECIPE_NUMBERS.map(([key, label, bounds]) => E.edit(label, model[key] ?? "", "number", undefined, controls ? { ...bounds, ...bind(key) } : undefined)));
  const versionNote = readOnly
    ? (model.notes ? E.fld("Version note", model.notes) : null)
    : E.edit("Version note", model.notes ?? "", "text", undefined, bind("notes"));
  const head = (
    <>
      {parentForm}
      {model.priceGroupOptions
        ? <>
          {E.pick("Default price group · optional", model.priceGroup ?? "", model.priceGroupOptions)}
          {E.info("A pre-fill for the brand a batch packages into, nothing more. The version carries no price and no group; changing this cuts no new version.")}
        </>
        : null}
      {model.note ? E.row("Recipe note", model.note) : null}
      {model.saved ? E.fld("Saved", model.saved) : null}
      {/* Always mounted and polite: the prediction changes as the draft is typed,
          and an alert (E.info is one) would interrupt the screen reader on every keystroke. */}
      <div role="status">{statusText(model.predicted)}</div>
    </>
  );
  const body = model.empty ? (
    <>
      {head}
      {E.blank(model.empty)}
    </>
  ) : (
    <>
      {head}
      {E.ttl("Ingredients")}
      {(model.ingredients ?? []).map((row) => (
        <Fragment key={row.key}>{E.row(row.title, row.detail, row.action ?? row.qty)}</Fragment>
      ))}
      {slots.addIngredient ?? (readOnly ? null : E.row("+ add ingredient", "material · stage · timing", ""))}
      {E.ttl("Process")}
      {numbers}
      {schedule(model.mash, slots.mash)}
      {schedule(model.fermentation, slots.fermentation)}
      {schedule(model.water, slots.water)}
      {versionNote}
      {model.tape?.length ? E.tape(model.tape) : null}
      {model.actualsNote ? E.note(model.actualsNote) : null}
      {controls ? (
        <>
          <div role="status">{statusText(controls.blocked)}</div>
          <CommandFormMessage error={controls.error} />
          <Button type="submit" className="w-full md:w-fit md:self-end" disabled={controls.busy || Boolean(controls.blocked)}>{controls.busy ? "Saving…" : controls.submitLabel ?? "Create recipe version"}</Button>
        </>
      ) : null}
    </>
  );
  // The draft submits at the bottom; every other surface (the live read page and the inventory frame alike) puts its one verb in the title row.
  const verb = controls ? undefined : E.btn("Create recipe version", "p", model.createHref);
  return (
    <>
      {E.back(model.backLabel ?? "Recipes", model.title, verb, model.backHref)}
      {controls
        ? <form className="contents" onSubmit={(event) => { event.preventDefault(); if (!controls.busy && !controls.blocked) controls.onSubmit(); }}>{body}</form>
        : body}
    </>
  );
}
