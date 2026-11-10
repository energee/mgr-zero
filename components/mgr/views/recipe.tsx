// components/mgr/views/recipe.tsx — Recipe: the one brewsheet. Under the title
// one band holds the recipe's own fields (parentForm: the brand, or name, brand
// and note while it is being created), the headline figures (OG, FG, ABV, IBU)
// and Batch size, the batch the recipe is written for: saved with the sheet,
// and optional. The sheet
// then reads as the brew day runs (RECIPE_SECTIONS): each step is a card, and
// from about 670px of page width the cards flow down two columns, in order.
// A card's heading line holds its process numbers, each a small field under
// its label. Under it sit the ingredients used there, one tight row each
// (name, timing, amount per bbl; a stage is named only where the heading does
// not, as a dry hop under Fermentation; a mash line reads its share of the
// grain bill there too), then Add ingredient, then the step's
// schedule listed row by row under its count and summary with Edit schedule
// beside it. With a batch size, each line adds its amount for the batch on a
// second line, as a count of packs when it is whole packs ("23 bags"), and off
// a read-out each line not in whole packs offers Round choices, down and up.
// The inventory draws it static from
// a fixture. The live editor (recipes/[id]/recipe-version-form.tsx) passes
// `controls`: the fields become controlled, a line's name, a step's Add
// ingredient and its Edit schedule open their sheets through `edit` and
// `slots`, and a save bar (what is still needed, Discard, Save changes) sticks
// to the bottom only while `controls.dirty`. `controls.refresh` offers Refresh
// from Materials under the figures. An earlier copy (`readOnly`) is a
// read-out: numbers, batch size and change note as text, nothing that edits it, `asBrewed`
// naming the batches that brewed it and Use this again in the title row.
// Otherwise the title row holds Schedule batch (to New batch on Batches) once
// the recipe is saved and has no unsaved change. Batch actuals follows the
// sheet as a table: what the shown copy predicts on top, then what each brewed
// batch measured, and the gap for the shown copy. As brewed sits beside it:
// the earlier copies batches brewed, each opening read only. The page never
// says "version".
"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { sentenceCase } from "@/lib/mgr/labels";
import type { IngredientStage } from "@/lib/mgr/recipe-process-view";
import { BATCH_BBL_BOUNDS, batchSize, batchTotalText, packRounding, RECIPE_NUMBERS, RECIPE_SECTIONS, wholePercent, type RecipeActuals, type RecipeIngredientView, type RecipeNumberKey, type RecipeSection, type RecipeViewModel } from "@/lib/mgr/recipe-view";
import { cn } from "@/lib/utils";

/** The steps that hold a schedule; the model carries one under the same key. */
type ScheduleKey = "water" | "mash" | "fermentation";

/** A headline figure: its number large, its unit (°P, %) small beside it, its name under. */
function Figure({ value, label }: { value: string; label: string }) {
  const unit = /^(.*\d)\s?(°P|%)$/.exec(value);
  return (
    <div>
      <div className="font-semibold text-xl tabular-nums leading-tight @3xl:text-2xl">
        {unit ? <>{unit[1]}<span className="ml-0.5 font-normal text-muted-foreground text-sm">{unit[2]}</span></> : value}
      </div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

/** Batch actuals: one narrow table at every width. The top row is what the shown copy predicts and assumes; a batch
 *  another copy brewed prints that copy's own prediction in brackets under its figure. The brew date drops under the
 *  batch number on a phone, and a batch's notes take a line of their own, so no column has to widen for them. */
function Actuals({ actuals }: { actuals: RecipeActuals }) {
  const cell = "px-1.5 py-1 text-right tabular-nums first:pl-0 last:pr-0";
  return (
    <Table className="text-sm">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 px-1.5 pl-0 font-normal text-muted-foreground text-xs">Batch</TableHead>
          {actuals.columns.map((column) => (
            <TableHead key={column} className="h-8 px-1.5 text-right font-normal text-muted-foreground text-xs last:pr-0">
              {/* The two long heads shorten on a phone; a screen reader still hears the word. */}
              {column.length > 8 ? <><span aria-hidden className="@xl:hidden">{column.slice(0, 3)}.</span><span className="sr-only @xl:not-sr-only">{column}</span></> : column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow className="text-muted-foreground hover:bg-transparent">
          <TableCell className="px-1.5 py-1 pl-0">Predicted</TableCell>
          {actuals.predicted.map((value, i) => <TableCell key={actuals.columns[i]} className={cell}>{value}</TableCell>)}
        </TableRow>
        {actuals.rows.map((row) => (
          <Fragment key={row.key}>
            <TableRow className={cn("hover:bg-transparent", row.notes.length && "border-b-0")}>
              <TableCell className="px-1.5 py-1 pl-0">
                <span className="font-medium">{row.batch}</span>{" "}
                <span className="block text-muted-foreground text-xs @xl:inline @xl:text-sm">{row.brewed}</span>
              </TableCell>
              {row.cells.map((c, i) => (
                <TableCell key={actuals.columns[i]} className={cell}>
                  {c.measured}
                  {c.predicted ? <span className="block text-muted-foreground text-xs @xl:ml-1 @xl:inline">({c.predicted})</span> : null}
                </TableCell>
              ))}
            </TableRow>
            {row.notes.length ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={actuals.columns.length + 1} className="whitespace-normal px-0 pt-0 pb-1 text-muted-foreground text-xs">{row.notes.join(" · ")}</TableCell>
              </TableRow>
            ) : null}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}

export type RecipeControls = {
  set: (key: RecipeNumberKey | "notes" | "batchBbl", value: string) => void;
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
  /** A saved copy read out: numbers, batch size and notes as text, schedules as rows, nothing that edits it. */
  readOnly?: boolean;
  slots?: RecipeSlots;
}) {
  // Exponent notation such as 1e1 is not a batch size: the field shows why, and no batch amounts are drawn.
  const bbl = batchSize(model.batchBbl);
  const lines = model.ingredients ?? [];
  const packed = lines.some((row) => row.pack);
  const bind = (key: RecipeNumberKey | "notes" | "batchBbl") => (controls ? { onChange: (value: string) => controls.set(key, value) } : undefined);
  // A number of a saved copy read out: its label small, its value under it.
  const readNumber = (label: string, value: ReactNode) => (
    <dl className="text-right">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium text-sm tabular-nums">{value}</dd>
    </dl>
  );
  // A line's name. On the sheet it opens the line's Ingredient sheet; the fixture draws the same button static.
  const name = (row: RecipeIngredientView) => {
    if (readOnly) return row.title;
    const trigger = <Button type="button" variant="link" className="h-auto whitespace-normal p-0 text-left"><span className="sr-only">Edit </span>{row.title}</Button>;
    return row.edit ? row.edit(trigger) : trigger;
  };
  // A line's amount at the batch size, then Whole packs or (off a read-out) its Round choices.
  const total = ({ pack, onRound }: RecipeIngredientView) => {
    if (!pack) return null;
    const rounding = packRounding(pack, bbl);
    return (
      <div className="col-span-full flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-muted-foreground tabular-nums">
        <span><span className="sr-only">At {bbl} bbl: </span>{batchTotalText(pack, bbl)}</span>
        {rounding?.whole ? E.status("Whole packs", "ok") : null}
        {rounding && !readOnly ? rounding.choices.map((c) => (
          <Button key={c.label} type="button" variant="outline" size="xs" onClick={onRound ? () => onRound(c.perBbl) : undefined}>{c.label}</Button>
        )) : null}
      </div>
    );
  };
  // One step of the brew day, as a card: a heading line with its process numbers, the ingredients used there, and its schedule.
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
    // The quiet middle column: a mash line's share of the grain bill, then its stage and timing.
    const timed = rows.some((row) => row.share !== undefined || when(row));
    const totals = bbl > 0;
    // Each action says its step after its words, for a screen reader and the inventory's tap map; the heading above it says it on screen.
    const add = stages.length && !readOnly ? <Button type="button" variant="ghost" size="sm" className="-ml-2.5 text-muted-foreground">Add ingredient<span className="sr-only"> to {title.toLowerCase()}</span></Button> : null;
    const edit = plan && scheduleKey && !readOnly
      ? <Button type="button" variant="ghost" size="sm" className="-mr-2.5 text-muted-foreground">{scheduleKey === "water" ? "Edit water" : <>Edit schedule<span className="sr-only"> for {title.toLowerCase()}</span></>}</Button>
      : null;
    const body = rows.length > 0 || Boolean(add);
    return (
      <section key={key} className="mb-3 flex break-inside-avoid flex-col gap-1 rounded-lg border p-3">
        {/* The heading sits level with the fields beside it, which stand under their labels. Where they do not fit
            beside it (three fields on a phone) they drop under it together, still in one row. */}
        <div className="flex flex-wrap items-end justify-end gap-x-4 gap-y-2">
          <h2 className={cn("mr-auto font-semibold text-base", fields.length > 0 && !readOnly && "pb-1")}>{title}</h2>
          {fields.length ? (
            <div className="flex items-end gap-x-3">
              {fields.map(([number, label, bounds]) => (readOnly ? (
                <Fragment key={number}>{readNumber(label, model[number])}</Fragment>
              ) : (
                <div key={number}>{E.edit(label, model[number] ?? "", "number", undefined, { compact: true, ...(controls ? { ...bounds, ...bind(number) } : undefined) })}</div>
              )))}
            </div>
          ) : null}
        </div>
        {rows.length ? (
          <ul className={cn("grid gap-x-4 text-sm", timed ? "grid-cols-[minmax(0,1fr)_auto_auto]" : "grid-cols-[minmax(0,1fr)_auto]")}>
            {rows.map((row) => (
              <li key={row.key} className="col-span-full grid grid-cols-subgrid items-baseline gap-y-1 border-t py-1.5 first:border-t-0">
                <span className="min-w-0">{name(row)}</span>
                {timed ? (
                  <span className="text-right text-muted-foreground">
                    {row.share !== undefined ? <>{wholePercent(row.share)}<span className="sr-only"> of the grain bill</span>{when(row) ? " · " : null}</> : null}
                    {when(row)}
                  </span>
                ) : null}
                <span className="text-right tabular-nums">{row.amount}<span className="text-muted-foreground"> / bbl</span></span>
                {totals ? total(row) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {add ? <div>{slots.addIngredient ? slots.addIngredient(stages[0], add) : add}</div> : null}
        {plan ? (
          <div className={cn("flex flex-col", body && "mt-1 border-t pt-2")}>
            <div className="flex items-center justify-between gap-2">
              {/* The schedule's count and summary head its rows. One row is its own summary, so it is not said twice (#1518). */}
              <p className="text-muted-foreground text-xs"><span className="font-medium text-foreground">{plan.title}</span>{plan.detail && plan.rows.length !== 1 ? <> · {plan.detail}</> : null}</p>
              {edit ? (scheduleKey && slots.schedule ? slots.schedule(scheduleKey, edit) : edit) : null}
            </div>
            {plan.rows.length ? (
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 text-sm">
                {plan.rows.map((r, i) => (
                  <div key={i} className="col-span-full grid grid-cols-subgrid items-baseline border-t py-1 first:border-t-0">
                    <dt className="min-w-0">{r.title}</dt>
                    <dd className="text-right text-muted-foreground">{r.detail}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  };
  const figures = model.figures ?? [];
  // The quiet lines beside the figures: when the copy was saved and the recipe's note, what a figure leaves out, and the batch-size hint.
  const about = [
    [model.saved && `Saved ${model.saved}`, model.recipeNote].filter(Boolean).join(" · "),
    ...(model.figureNotes ?? []),
    packed && !(bbl > 0) && !readOnly ? "Enter a batch size to see each amount for the batch." : "",
  ].filter(Boolean);
  const sheet = (
    <div className="@container flex min-w-0 flex-col gap-3">
      {/* The band: the recipe's own fields side by side at a fixed width, then the figures and the batch size. Beside
          one field (the brand) the figures share its row; after three or four they take the next, at full width. */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 [&>[data-slot=field]]:w-full @md:[&>[data-slot=field]]:w-52">
        {model.asBrewed ? <div className="basis-full">{E.note(model.asBrewed)}</div> : parentForm}
        {model.priceGroupOptions
          ? E.pick("Default price group · optional", model.priceGroup ?? "", model.priceGroupOptions, {
            description: <FieldDescription>A pre-fill for the brand a batch packages into. Changing it does not change the recipe.</FieldDescription>,
          })
          : null}
        {/* Always mounted, so the status regions exist before anything is predicted. */}
        <div className="flex min-w-0 flex-[1_1_32rem] flex-wrap items-end justify-between gap-x-6 gap-y-3">
            {/* What the figures leave unsaid reads beside them on the desk and under them on a phone. Always mounted and
                polite: the figures change as the sheet is typed, and an alert (E.info is one) would interrupt the screen
                reader on every keystroke. */}
            <div role="status" className="order-last flex min-w-0 basis-full flex-col gap-1 empty:hidden @3xl:order-first @3xl:flex-1 @3xl:basis-0">
              {about.map((line) => <Fragment key={line}>{E.polite(line)}</Fragment>)}
            </div>
            <div role="status" className={cn("flex gap-x-4 @3xl:gap-x-6", !figures.length && "hidden")}>
              {figures.map(([value, label]) => <Figure key={label} value={value} label={label} />)}
            </div>
            {/* The batch the recipe is written for. A read-out prints it only when the copy holds one. */}
            {readOnly
              ? (model.batchBbl ? readNumber("Batch size bbl", model.batchBbl) : null)
              : <div>{E.edit("Batch size bbl", model.batchBbl ?? "", "number", undefined, { compact: true, ...(controls ? { ...BATCH_BBL_BOUNDS, ...bind("batchBbl") } : undefined) })}</div>}
        </div>
      </div>
      {controls?.refresh ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {E.polite(controls.refresh.text)}
          <Button type="button" variant="outline" size="sm" disabled={controls.busy} onClick={controls.refresh.onRefresh}>Refresh from Materials</Button>
        </div>
      ) : null}
      {/* With no unsaved change there is no save bar, so a failed refresh or an unreadable kept change says so here. */}
      {controls && !controls.dirty ? <CommandFormMessage error={controls.error} /> : null}
      {/* Cards run down the first column, then the second: brew-day order is reading order. */}
      <div className="@2xl:columns-2 @2xl:gap-4 [&>*:last-child]:mb-0">{RECIPE_SECTIONS.map(step)}</div>
      {readOnly
        ? (model.notes ? E.fld("Change note", model.notes) : null)
        : E.edit("Change note · optional", model.notes ?? "", "text", undefined, bind("notes"))}
      {model.actuals || model.history?.length ? (
        <div className={cn("grid items-start gap-x-8 gap-y-3", model.actuals && model.history?.length && "@4xl:grid-cols-[minmax(0,1fr)_18rem]")}>
          {model.actuals ? (
            <div className="flex min-w-0 max-w-3xl flex-col gap-2">
              {E.ttl("Batch actuals")}
              <Actuals actuals={model.actuals} />
              {model.actualsNote ? E.polite(model.actualsNote) : null}
            </div>
          ) : null}
          {model.history?.length ? (
            <div className="flex min-w-0 flex-col">
              {E.ttl("As brewed")}
              {/* The copy being shown is named, not linked to itself. */}
              {model.history.map((h, i) => <Fragment key={i}>{h.selected ? E.row(h.title, h.detail, "Shown") : E.nav(h.title, h.detail, "", undefined, h.href, "Recipe")}</Fragment>)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  const body = (
    <>
      {sheet}
      {controls?.dirty ? (
        // Stuck to the bottom of the page's scroll at every width, so the verb is in reach wherever the change was made.
        // The negative offsets reach the page column's padding (app-shell: p-4, md:px-8 md:py-6), as BrewFooter's do on the phone.
        <div className="sticky -bottom-4 z-10 -mx-4 flex flex-col gap-2 border-t bg-background px-4 py-3 md:-bottom-6 md:-mx-8 md:flex-row md:items-center md:justify-end md:px-8">
          <div role="status">{E.polite(controls.blockedReason)}</div>
          <CommandFormMessage error={controls.error} />
          {/* Side by side on a phone, so the bar takes one row of the screen, not two. */}
          <div className="flex gap-2 *:flex-1 md:*:flex-none">
            {controls.onDiscard ? E.btn("Discard", "g", undefined, controls.onDiscard) : null}
            <Button type="submit" className="w-full md:w-fit" disabled={controls.busy || Boolean(controls.blockedReason)}>{controls.busy ? "Saving…" : controls.submitLabel ?? "Save changes"}</Button>
          </div>
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
