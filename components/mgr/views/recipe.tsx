// components/mgr/views/recipe.tsx — Recipe: the brew sheet as the day at a
// glance (the approved look is docs/plans/recipe-run-sheet-mock.html). Top to
// bottom: the name; one sentence (the brand, the batch size, the recipe's
// note and when it was saved), then that save's change note on a line of its
// own, "Last change"; the predicted figures (OG, FG, ABV, IBU), four across at
// every width, with the two assumptions under them; the band, one temperature
// line from mash-in to knock-out (StepLine); then two columns that stack on a
// phone. "Goes in on brew day" lists everything in time order with each
// moment said once, under a line of its facts and a bar of the grain bill's
// shares, which sits on the grain's rows because they lead the list. "In the
// cellar" draws the temperature by day over the pitch,
// the dry hops and any packaging or other additions. A row is when, what, and
// how much for the batch; without a batch size it reads per bbl. Under the
// sheet sit Batch actuals, folded to its summary line over the table, and As
// brewed, one row per earlier copy. The table has a row per batch, a row per
// tank for a batch split across tanks that held beer at the same time ("in FV3"), and the newest batches other
// recipes brewed on the same grain bill ("as Session IPA"). The rows, drawings
// and sentences are worked out in lib/mgr/recipe-day-view.ts, and Batch
// actuals in lib/mgr/recipe-view.ts.
// The sheet has no always-visible number field. The batch size and the eight
// process numbers read as text. One read in a sentence (the batch size, the
// two assumptions, the pre-boil volume, the whirlpool and knock-out
// temperatures) opens the one Recipe numbers sheet. The boil time and the two
// whirlpool times are written on the band, which is not tappable; Edit recipe
// numbers under the band opens the sheet for them. The line over the brew-day
// list also says which of the boil time, the whirlpool's time and temperature
// and the knock-out temperature apply and are not set, each as words that open
// the same sheet (brewDayFacts). A water fact opens Water; a
// line's name opens its Ingredient sheet. Link style is for names and values
// only: every action (Add ingredient, the Edit actions, a Round choice) is a
// quiet outline button.
// The inventory draws it static from a fixture. The live editor
// (recipes/[id]/recipe-version-form.tsx) passes `controls` and `slots`: the
// sheets open through them, the brand pick saves on its own, and a save bar
// (what is still needed, the change note, Discard, Save changes) sticks to
// the bottom only while `controls.dirty`. `parentForm` is the row under the
// title: the name, brand and note fields while the recipe is being created,
// and the editor's notices. `controls.refresh` offers Refresh from Materials
// under the figures.
// An earlier copy (`readOnly`) is a read-out: plain text, nothing that edits
// it, `asBrewed` naming the batches that brewed it and Use this again in the
// title row. It has no sheets to open, so it alone lists each mash rest and
// fermentation stage (scheduleReadOut) and names the source water profile. Otherwise the title row holds Schedule batch (to New batch on
// Batches) once the recipe is saved and has no unsaved change. The page never
// says "version".
"use client";
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { plural } from "@/lib/mgr/plural";
import { assumptions, brewDayBand, brewDayFacts, brewDayMoments, cellarFacts, cellarMoments, cellarProfile, scheduleReadOut, sentence, type Fact, type GoesInMoment, type GoesInRow } from "@/lib/mgr/recipe-day-view";
import type { IngredientStage } from "@/lib/mgr/recipe-process-view";
import { batchSize, packRounding, wholePercent, type RecipeActuals, type RecipeViewModel } from "@/lib/mgr/recipe-view";
import { rowLinkPrefetch } from "@/lib/mgr/row-link-prefetch";
import { andList } from "@/lib/mgr/submit-reason";
import { cn } from "@/lib/utils";
import { StepLine } from "./step-line";

/** The fold line of Batch actuals when only other recipes have brewed this grain bill: the table then lists their
 *  batches alone, so a count of this recipe's batches ("0 batches brewed.") would misdescribe it. */
const NOT_BREWED_HERE = "Not brewed yet. Other recipes have brewed this grain bill.";

/** A sheet a fact or an action opens: the recipe's numbers, its water, or a schedule. */
type SheetKey = "numbers" | "water" | "mash" | "fermentation";

/** Batch actuals: one narrow table at every width. The top row is what the shown copy predicts and assumes; a batch
 *  another copy brewed prints that copy's own prediction in brackets under its figure. The brew date drops under the
 *  batch number on a phone, and so does the row's tag: its tank, or the recipe it was brewed as. A batch's notes and
 *  the table's footnote take a line of their own, so no column has to widen for them. */
function Actuals({ actuals }: { actuals: RecipeActuals }) {
  const cell = "px-1.5 py-1 text-right tabular-nums first:pl-0 last:pr-0";
  return (
    <Table className="text-sm" aria-label="Batch actuals">
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
          <TableCell className="px-1.5 py-1 pl-0" role="rowheader">Predicted</TableCell>
          {actuals.predicted.map((value, i) => <TableCell key={actuals.columns[i]} className={cell}>{value}</TableCell>)}
        </TableRow>
        {actuals.rows.map((row) => (
          <Fragment key={row.key}>
            <TableRow className={cn("hover:bg-transparent", row.notes.length && "border-b-0")}>
              <TableCell className="px-1.5 py-1 pl-0">
                <span className="font-medium">{row.batch}</span>{" "}
                <span className="block text-muted-foreground text-xs @xl:inline @xl:text-sm">{row.brewed}</span>
                {row.tag ? <>{" "}<span className="block whitespace-normal text-muted-foreground text-xs @xl:inline @xl:text-sm">{row.tag}</span></> : null}
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
        {actuals.footnote ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={actuals.columns.length + 1} className="whitespace-normal px-0 py-1.5 text-muted-foreground text-xs">{actuals.footnote}</TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}

/** What goes in, one row each: when, what, and how much. The moment is drawn on its first row only; the rows after it
 *  say it to a screen reader alone. `name` draws a row's name, and `under` what sits under the row (its Round choices).
 *  The rows are one flat list keyed by row, so a line that moves to another moment keeps its row and its open sheet. */
function GoesIn({ moments, name, under }: { moments: GoesInMoment[]; name: (row: GoesInRow) => ReactNode; under: (row: GoesInRow) => ReactNode }) {
  return (
    <ul className="grid grid-cols-[6em_minmax(0,1fr)_auto_auto] gap-x-2.5 text-sm @md:grid-cols-[7em_minmax(0,1fr)_auto_auto] @md:gap-x-6">
      {moments.flatMap((moment) => moment.rows.map((row, i) => (
        <li key={row.key} className={cn("col-span-full grid grid-cols-subgrid items-baseline pb-1.5", i ? "pt-0.5" : "border-t pt-1.5 first:border-t-0")}>
          <span className="text-muted-foreground">{i ? <span className="sr-only">{moment.when}</span> : moment.when}</span>
          <span className="min-w-0">{name(row)}</span>
          <span className="text-right text-muted-foreground tabular-nums">
            {/* A grain's weight gives way to its share where the column is narrow. */}
            {row.weight ? <span className="hidden @md:inline">{row.weight}, </span> : null}
            {row.share ? <>{row.share}<span className="sr-only"> of the grain bill</span></> : null}
          </span>
          <span className="text-right tabular-nums">{row.amount}</span>
          {under(row)}
        </li>
      )))}
    </ul>
  );
}

/** A grain-bar segment's tint. Malt colour is not in the data yet, so the segments step down in strength of the text
 *  colour, and every grain after the fifth keeps the faintest step. */
const GRAIN_TINTS = ["bg-foreground/60", "bg-foreground/45", "bg-foreground/32", "bg-foreground/22", "bg-foreground/14"];
/** A fact inside a sentence: it keeps the sentence's size and line height under any pointer, as a text link does. */
const FACT = "inline h-auto min-h-0! whitespace-normal p-0 text-left align-baseline font-normal text-[length:inherit]";
/** A row's name: a text link at the row's size. */
const TEXT_LINK = "h-auto whitespace-normal p-0 text-left font-normal";

/** An earlier copy's mash rests or fermentation stages, one line each: the name, then its detail when it has one
 *  (its kind, temperature and length; scheduleReadOut). */
function ScheduleReadOut({ label, lines }: { label: string; lines: { name: string; detail: string }[] }) {
  return (
    <ol aria-label={label} className="flex flex-wrap gap-x-6 gap-y-0.5 text-muted-foreground text-sm">
      {lines.map((line, i) => <li key={i}><span className="text-foreground">{line.name}</span>{line.detail ? ` · ${line.detail}` : null}</li>)}
    </ol>
  );
}

export type RecipeControls = {
  /** Takes the change note as it is typed; the save bar asks for one only when this is passed. A recipe being
   *  created passes none: its first save changes nothing. */
  setNote?: (value: string) => void;
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
  /** Opens the sheet that holds a fact drawn in a sentence or a row: the recipe's numbers, or its water. */
  onOpen?: (sheet: "numbers" | "water") => void;
  /** The brand pick, which saves on its own apart from the sheet; `error` is why that save failed. */
  brand?: { onChange: (value: string) => void; error?: string | null };
};
/** The live editor's sheets. Each takes the action the view drew and returns the sheet that action opens:
 *  addIngredient for Add ingredient (with the stage a new line starts on), sheet for the action named by its key. */
export type RecipeSlots = {
  addIngredient?: (stage: IngredientStage, trigger: ReactNode) => ReactNode; sheet?: (key: SheetKey, trigger: ReactNode) => ReactNode;
  /** Edit name and note, in the sentence beside the brand: returns the Recipe name sheet that action opens. */
  rename?: (trigger: ReactNode) => ReactNode;
};

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
  /** A saved copy read out: every fact as text, nothing that edits it. */
  readOnly?: boolean;
  slots?: RecipeSlots;
}) {
  // A size the copy cannot store (zero, exponent notation) is no batch size: every row then reads per bbl.
  const bbl = batchSize(model.batchBbl);
  const lines = model.ingredients ?? [];

  // A fact that opens the sheet holding it; a read-out prints its words.
  const fact = (text: string, opens: "numbers" | "water", key?: string) => (readOnly ? text : (
    <Button key={key} type="button" variant="link" className={FACT} onClick={controls?.onOpen ? () => controls.onOpen!(opens) : undefined}>
      {text}<span className="sr-only">, edit {opens === "numbers" ? "recipe numbers" : "water"}</span>
    </Button>
  ));
  const facts = (parts: Fact[]) => parts.map((part, i) => (typeof part === "string" ? part : fact(part.text, part.opens, String(i))));
  // An action under a block: a quiet button, as Refresh from Materials is. `said` names what it acts on after its
  // words, for a screen reader and the inventory's tap map.
  const act = (label: string, said = "") => <Button type="button" variant="outline" size="sm">{label}{said ? <span className="sr-only"> {said}</span> : null}</Button>;
  const sheet = (key: SheetKey, trigger: ReactNode) => (slots.sheet ? slots.sheet(key, trigger) : trigger);
  const add = (stage: IngredientStage, said: string) => {
    const trigger = act("Add ingredient", said);
    return slots.addIngredient ? slots.addIngredient(stage, trigger) : trigger;
  };
  // A row's name. An ingredient's opens its Ingredient sheet and a water row's opens Water; the fixture draws the same button static.
  const name = (row: GoesInRow) => {
    if (readOnly) return row.title;
    const open = !row.line && controls?.onOpen ? () => controls.onOpen!("water") : undefined;
    const trigger = <Button type="button" variant="link" className={TEXT_LINK} onClick={open}><span className="sr-only">Edit </span>{row.title}</Button>;
    return row.line?.edit ? row.line.edit(trigger) : trigger;
  };
  // Off a read-out, a line of one pack or more that is not whole packs offers its Round choices under its row, each named as the row will then read.
  const rounding = ({ line }: GoesInRow) => {
    const choices = !readOnly && line?.pack && bbl > 0 ? packRounding(line.pack, bbl)?.choices ?? [] : [];
    if (!choices.length) return null;
    return (
      <span className="col-start-2 -col-end-1 mt-1 flex flex-wrap justify-end gap-2">
        {choices.map((c) => <Button key={c.label} type="button" variant="outline" size="sm" onClick={line?.onRound ? () => line.onRound!(c.perBbl) : undefined}>{c.label}</Button>)}
      </span>
    );
  };

  // The sentence under the name: the brand and the batch size, then the recipe's note and when it was saved.
  const brand = model.brand && !readOnly ? model.brand : undefined;
  const brewed = Boolean(brand?.value);
  const batch = model.batchBbl?.trim() ? `${model.batchBbl} bbl` : "";
  // With no brand the pick reads its own "" option, "No brand yet", and starts the sentence.
  const lead: ReactNode[] = brand ? [brewed ? "Brews " : "", <Fragment key="brand">{E.pick("Brand", brand.value, brand.options, { inline: true, ...(controls?.brand && { onChange: controls.brand.onChange }) })}</Fragment>] : [];
  // The batch size keeps one key, so its sheet stays open while the words around it change.
  if (batch) lead.push(brand ? (brewed ? " at " : ", written for ") : "Written for ", fact(batch, "numbers", "batch"), ".");
  else if (!readOnly) lead.push(brand ? ", " : "", fact(brand ? "no batch size yet" : "No batch size yet", "numbers", "batch"), ".");
  const about = [model.recipeNote && sentence(model.recipeNote), model.saved && sentence(`Saved ${model.saved}`)].filter(Boolean).join(" ");
  // A saved recipe's name and note are edited in their own sheet, opened from the sentence that holds the brand pick.
  const renameTrigger = <Button type="button" variant="link" className={FACT}>Edit name and note</Button>;
  const rename = brand ? (slots.rename ? slots.rename(renameTrigger) : renameTrigger) : null;

  const figures = model.figures ?? [];
  // The quiet lines under the figures: what a figure leaves out, and the batch-size hint once a line could read a batch amount.
  const notes = [
    ...(model.figureNotes ?? []),
    lines.some((row) => row.pack) && !(bbl > 0) && !readOnly ? "Enter a batch size to see each amount for the batch." : "",
  ].filter(Boolean);
  const assumed = model.efficiency !== undefined || model.attenuation !== undefined || !readOnly ? assumptions(model) : undefined;

  const band = brewDayBand(model.mashSchedule ?? [], model, lines);
  const brewDay = brewDayMoments(lines, model.water, bbl);
  // The source water is read out on an earlier copy only; the editable page keeps it in its Water sheet. Only the
  // editable page says which numbers are not set.
  const brewDayLine = brewDayFacts(readOnly ? model.water : model.water && { ...model.water, source: undefined }, model, lines, !readOnly);
  const grain = lines.filter((row) => row.share !== undefined);
  const stages = model.fermentationSchedule ?? [];
  // An earlier copy has no schedule sheet to open, so it reads its rests and stages out.
  const readOut = readOnly ? scheduleReadOut(model.mashSchedule ?? [], stages) : undefined;
  const profile = cellarProfile(stages, lines);
  const cellar = cellarMoments(lines, bbl);
  const cellarLine = cellarFacts(stages) || (readOnly ? "" : "No fermentation schedule yet.");
  const heading = "font-semibold text-lg";
  const quiet = "text-muted-foreground text-sm";

  const sheetBody = (
    <div className="@container flex min-w-0 max-w-[67.5rem] flex-col">
      {/* The row under the title: an earlier copy's note, or the new recipe's fields side by side and the editor's notices. */}
      {model.asBrewed ? <div className="mb-3">{E.note(model.asBrewed)}</div> : parentForm ? (
        <div className="mb-3 flex flex-wrap items-start gap-x-6 gap-y-3 empty:hidden [&>[data-slot=field]]:w-full @md:[&>[data-slot=field]]:w-52">{parentForm}</div>
      ) : null}
      {lead.length || about ? <p className={cn(quiet, "max-w-[62ch]")}>{lead}{lead.length && about ? " " : null}{about}{rename ? <> {rename}</> : null}</p> : null}
      {model.savedNote ? <p className={cn(quiet, "max-w-[62ch]")}>Last change: {sentence(model.savedNote)}</p> : null}
      <CommandFormMessage error={controls?.brand?.error} />

      {/* Always in the page, even with no figure, and polite: a region that appears only once it has words is often
          not announced, and an alert would interrupt the screen reader on every keystroke as the sheet is typed.
          Empty, it takes no room. Four across at every width, smaller on a phone. */}
      <div role="status" className={cn("grid grid-cols-4 gap-x-3 @md:flex @md:flex-wrap @md:gap-x-11", figures.length > 0 && "mt-6")}>
        {figures.map(([value, label]) => (
          <div key={label} className="min-w-0">
            <div className="whitespace-nowrap font-heading font-semibold text-lg leading-none tabular-nums @md:text-[1.625rem]">{value}</div>
            <div className="mt-1 text-[0.8125rem] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      {assumed ? <p className={cn(quiet, "mt-2")}>Assumes {fact(assumed[0], "numbers")} and {fact(assumed[1], "numbers")}.</p> : null}
      <div role="status" className="flex flex-col gap-1 not-empty:mt-1">
        {notes.map((line) => <Fragment key={line}>{E.polite(line)}</Fragment>)}
      </div>
      {controls?.refresh ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {E.polite(controls.refresh.text)}
          <Button type="button" variant="outline" size="sm" disabled={controls.busy} onClick={controls.refresh.onRefresh}>Refresh from Materials</Button>
        </div>
      ) : null}
      {/* With no unsaved change there is no save bar, so a failed refresh or an unreadable kept change says so here. */}
      {controls && !controls.dirty ? <CommandFormMessage error={controls.error} /> : null}

      {band || !readOnly ? (
        <section className="mt-6">
          {band ? <StepLine model={band} rise={58} /> : null}
          {readOut?.rests.length ? <div className="mt-2"><ScheduleReadOut label="Mash rests" lines={readOut.rests} /></div> : null}
          {readOnly ? null : (
            <div className="mt-2 flex flex-wrap gap-2">
              {sheet("mash", act("Edit mash schedule"))}
              {sheet("numbers", act("Edit recipe numbers"))}
            </div>
          )}
        </section>
      ) : null}

      <div className="mt-6 grid gap-x-14 gap-y-7 @3xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {brewDay.length || brewDayLine.length || !readOnly ? (
          <section className="@container flex min-w-0 flex-col gap-2">
            <h2 className={heading}>Goes in on brew day</h2>
            {brewDayLine.length ? <p className={quiet}>{facts(brewDayLine)}</p> : null}
            {grain.length > 1 ? (
              <div role="img" aria-label={`Share of the grain bill by weight: ${andList(grain.map((row) => `${row.title} ${wholePercent(row.share!)}`))}`} className="mt-1 flex h-3 gap-0.5">
                {grain.map((row, i) => <span key={row.key} style={{ flexGrow: row.share }} className={cn("rounded-sm", GRAIN_TINTS[Math.min(i, GRAIN_TINTS.length - 1)])} />)}
              </div>
            ) : null}
            {brewDay.length ? <GoesIn moments={brewDay} name={name} under={rounding} /> : readOnly ? null : <p className={quiet}>Nothing goes in yet.</p>}
            {readOnly ? null : (
              <div className="mt-1 flex flex-wrap gap-2">
                {add("mash", "to brew day")}
                {sheet("water", act("Edit water"))}
              </div>
            )}
          </section>
        ) : null}
        {cellar.length || profile || !readOnly ? (
          <section className="@container flex min-w-0 flex-col gap-2">
            <h2 className={heading}>In the cellar</h2>
            {cellarLine ? <p className={quiet}>{cellarLine}</p> : null}
            {profile ? <div className="mt-1"><StepLine model={profile} rise={50} /></div> : null}
            {readOut?.stages.length ? <ScheduleReadOut label="Fermentation stages" lines={readOut.stages} /> : null}
            {cellar.length ? <GoesIn moments={cellar} name={name} under={rounding} /> : null}
            {readOnly ? null : (
              <div className="mt-1 flex flex-wrap gap-2">
                {add("fermentation", "to the cellar")}
                {sheet("fermentation", act("Edit schedule", "for fermentation"))}
              </div>
            )}
          </section>
        ) : null}
      </div>

      {model.priceGroupOptions && !readOnly ? (
        <div className="mt-8 max-w-xs">
          {E.pick("Default price group · optional", model.priceGroup ?? "", model.priceGroupOptions, {
            description: <FieldDescription>A pre-fill for the brand a batch packages into. Changing it does not change the recipe.</FieldDescription>,
          })}
        </div>
      ) : null}

      {model.actuals || model.history?.length ? (
        <div className="mt-8 border-t">
          {model.actuals ? (
            // The heading, then the fold: its summary line, and the table that opens under it. The heading sits before
            // the fold, as As brewed's does beside its rows, because a heading inside <summary> is dropped by many screen readers.
            <div className="flex flex-col gap-x-4 gap-y-1 border-b py-3 @md:flex-row @md:items-baseline">
              <h2 className="shrink-0 font-semibold text-[0.9375rem]">Batch actuals</h2>
              <details className="group min-w-0 flex-1">
                <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1 rounded-sm [&::-webkit-details-marker]:hidden">
                  <span className={quiet}>{model.actualsNote ?? (model.actuals.batches === 0 ? NOT_BREWED_HERE : `${plural(model.actuals.batches, "batch", "batches")} brewed.`)}</span>
                  <span className="ml-auto text-primary text-sm"><span className="group-open:hidden">Show batches</span><span className="hidden group-open:inline">Hide batches</span></span>
                </summary>
                <div className="max-w-3xl pt-2"><Actuals actuals={model.actuals} /></div>
              </details>
            </div>
          ) : null}
          {model.history?.length ? (
            <div className="flex flex-col gap-x-4 gap-y-1 border-b py-3 @md:flex-row @md:items-baseline">
              <h2 className="shrink-0 font-semibold text-[0.9375rem]">As brewed</h2>
              <ul className="flex min-w-0 flex-1 flex-col gap-1">
                {model.history.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-4 text-sm">
                    <span className="text-muted-foreground"><span className="text-foreground">{h.title}</span> · {h.detail}</span>
                    {/* The copy being shown is named, not linked to itself. */}
                    {h.selected ? <span className="ml-auto text-muted-foreground">Shown</span> : (
                      <Link href={h.href ?? "#"} prefetch={rowLinkPrefetch(h.href ?? "#")} data-to="Recipe" className="ml-auto rounded-sm text-primary underline-offset-4 hover:underline">
                        Open<span className="sr-only"> the recipe as brewed in {h.title}</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  const body = (
    <>
      {sheetBody}
      {controls?.dirty ? (
        // Stuck to the bottom of the page's scroll at every width, so the verb is in reach wherever the change was made.
        // The negative offsets reach the page column's padding (app-shell: p-4, md:px-8 md:py-6), as BrewFooter's do on the phone.
        <div className="sticky -bottom-4 z-10 -mx-4 flex flex-col gap-2 border-t bg-background px-4 py-3 md:-bottom-6 md:-mx-8 md:flex-row md:items-end md:justify-end md:gap-4 md:px-8">
          <div role="status">{E.polite(controls.blockedReason)}</div>
          <CommandFormMessage error={controls.error} />
          {/* The change note is asked for with the save it describes: above the buttons on a phone, beside them on the desk. */}
          {controls.setNote ? <div className="md:w-72">{E.edit("Change note · optional", model.notes ?? "", "text", undefined, { onChange: controls.setNote })}</div> : null}
          {/* Side by side on a phone, so the buttons take one row of the screen, not two. */}
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
      {E.back(model.backLabel ?? "Recipes", <span className="text-2xl leading-tight tracking-tight md:text-3xl">{model.title}</span>, verb, model.backHref)}
      {controls
        ? <form className="contents" onSubmit={(event) => { event.preventDefault(); if (controls.dirty && !controls.busy && !controls.blockedReason) controls.onSubmit(); }}>{body}</form>
        : body}
    </>
  );
}
