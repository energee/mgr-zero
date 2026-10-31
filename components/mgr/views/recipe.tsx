// components/mgr/views/recipe.tsx — Recipe: the one editor. The inventory
// draws it static from a fixture. A cut version on the live page (`readOnly`)
// is a read-out: its numbers and version note as label/value text, its
// schedules as rows under their headings. The live draft
// (recipes/[id]/recipe-version-form.tsx) passes `controls`: the fields become
// controlled, the schedule and ingredient rows open their sheets through
// `slots`, the bottom button submits, and `controls.blockedReason` says what the
// draft still lacks. Without `controls`, New recipe version sits in the
// title row, with Schedule batch (to New batch on Batches) beside it once a
// version exists. parentForm draws the recipe's parent fields (name, brand and
// note) at the top. Show totals at is a page-only batch size, never saved:
// typed, each brew-day line shows its batch total in packs, and off the read
// page each line not in whole packs offers "Round to N × size", down and up.
"use client";
import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { isNumber } from "@/lib/mgr/quantity-input";
import { batchTotalText, packRounding, RECIPE_NUMBERS, type RecipeIngredientView, type RecipeNumberKey, type RecipeScheduleView, type RecipeViewModel } from "@/lib/mgr/recipe-view";

export type RecipeControls = {
  set: (key: RecipeNumberKey | "notes", value: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  busy?: boolean;
  /** What the draft still needs before it can be saved (draftBlocker); set means the submit is disabled. */
  blockedReason?: string | null;
  error?: string | null;
};
/** Rows that open a sheet on the live draft; each replaces the fixture's static row with the same row as trigger. */
export type RecipeSlots = { addIngredient?: ReactNode; mash?: ReactNode; fermentation?: ReactNode; water?: ReactNode };
/** The draft's add-ingredient row: drawn here when no slot is passed, and the live IngredientSheet's trigger. */
export const ADD_INGREDIENT_ROW = E.row("Add ingredient", "Material, stage and timing", "");

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
  /** A cut version: numbers and notes read out as text, schedules as rows, nothing that edits it (Show totals at only sizes the totals). */
  readOnly?: boolean;
  slots?: RecipeSlots;
}) {
  const [totalsAt, setTotalsAt] = useState(model.totalsAtBbl ?? "");
  // Exponent notation such as 1e1 is not a batch size: the field shows why, and no totals are drawn.
  const bbl = isNumber(totalsAt) ? Number(totalsAt) : 0;
  const packed = (model.ingredients ?? []).some((row) => row.pack);
  // A brew-day line's total at the typed size, then Whole packs or (off the read page) its Round choices.
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
  // A schedule: the live draft's sheet trigger, else its heading, rows and summary on a cut version (one row is its own summary, so it is not repeated), else the row that opens its screen.
  const schedule = (s: RecipeScheduleView | undefined, slot: ReactNode) => {
    if (slot) return slot;
    if (!s) return null;
    if (!s.rows) return E.nav(s.title, s.detail);
    return (
      <>
        {E.ttl(s.title)}
        {s.rows.map((r, i) => <Fragment key={`${s.title}-${i}`}>{E.row(r.title, r.detail)}</Fragment>)}
        {s.detail && s.rows.length > 1 ? E.info(s.detail) : null}
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
      {model.historical ? null : parentForm}
      {model.priceGroupOptions
        ? <>
          {E.pick("Default price group · optional", model.priceGroup ?? "", model.priceGroupOptions)}
          {E.info("A pre-fill for the brand a batch packages into, nothing more. The version carries no price and no group; changing this cuts no new version.")}
        </>
        : null}
      {model.recipeNote ? E.row("Recipe note", model.recipeNote) : null}
      {model.saved ? E.fld("Saved", model.saved) : null}
      {model.versions?.length ? (
        <nav aria-label="Recipe versions" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="text-muted-foreground">Versions</span>
          {model.versions.map((version) => (
            <Link key={version.number} href={version.href ?? "#"} data-to="Recipe" aria-current={version.selected ? "page" : undefined} className="underline underline-offset-4 aria-[current=page]:font-semibold">
              v{version.number}{version.latest ? " (current)" : ""}
            </Link>
          ))}
        </nav>
      ) : null}
      {model.historical ? E.note("Older version · read only. Open the current version to make changes.") : null}
      {/* Always mounted and polite: the prediction changes as the draft is typed,
          and an alert (E.info is one) would interrupt the screen reader on every keystroke. */}
      <div role="status">{E.polite(model.predicted)}</div>
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
      {packed ? (
        <>
          {E.edit("Show totals at (bbl)", totalsAt, "number", undefined, { onChange: setTotalsAt, min: 0 })}
          {bbl > 0 ? null : E.polite("Enter a batch size to see totals in packs.")}
        </>
      ) : null}
      {(model.ingredients ?? []).map((row) => (
        <Fragment key={row.key}>{E.row(row.title, row.detail, row.action ?? row.qty, "", undefined, packFoot(row))}</Fragment>
      ))}
      {slots.addIngredient ?? (readOnly ? null : ADD_INGREDIENT_ROW)}
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
          <div role="status">{E.polite(controls.blockedReason)}</div>
          <CommandFormMessage error={controls.error} />
          <Button type="submit" className="w-full md:w-fit md:self-end" disabled={controls.busy || Boolean(controls.blockedReason)}>{controls.busy ? "Saving…" : controls.submitLabel ?? "Create recipe version"}</Button>
        </>
      ) : null}
    </>
  );
  // The draft submits at the bottom; every other surface (the live read page and the inventory frame alike) puts its verbs in the title row:
  // New recipe version, and once a version exists Schedule batch beside it (#1581).
  let verb: ReactNode;
  if (!controls && !model.historical) {
    verb = model.empty
      ? E.btn("New recipe version", "p", model.createHref)
      : E.btns([["Schedule batch", "g", model.scheduleHref], ["New recipe version", "p", model.createHref]]);
  }
  return (
    <>
      {E.back(model.backLabel ?? "Recipes", model.title, verb, model.backHref)}
      {controls
        ? <form className="contents" onSubmit={(event) => { event.preventDefault(); if (!controls.busy && !controls.blockedReason) controls.onSubmit(); }}>{body}</form>
        : body}
    </>
  );
}
