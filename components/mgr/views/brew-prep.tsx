// components/mgr/views/brew-prep.tsx — a batch's Prep tab: the brew-day pull
// list, drawn in the order Pick sheet's format (./pick.tsx). Lines start at plan
// in whole packs plus loose base units; the brewer touches only exceptions.
// Also exports the batch's Prep / Brew day tab bar, the packs + loose field and
// the exact-source pick that the Brew day timeline (./brew-timeline.tsx) reuses
// for its Edit.
"use client";
import { Fragment, useId, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import { Button } from "@/components/ui/button";
import { CHANGE_PLAN_ID, isShort, needsSource, noStockNote, prepReason, pullDetail, pullTone, showsPacks, sourceChoices, type BrewDayStage, type BrewIngredient, type BrewPrepViewModel } from "@/lib/mgr/brew-prep-view";
import { vesselOptions } from "@/lib/mgr/brew-day-view";
import { materialSourceKey } from "@/lib/mgr/material-source";
import { BREW_DAY_STAGES } from "@/lib/mgr/recipe-process-view";
import { sentenceCase } from "@/lib/mgr/labels";

/** The batch detail's two tabs; each names the screen it opens in the explorer.
 *  Live passes `hrefs` (the batch page's `?tab=` links), so a tab opens its page; the inventory's tabs stay inert. */
export function BrewTabs({ on, hrefs }: { on: 0 | 1; hrefs?: Record<string, string> }) {
  return <TabBar names={["Prep", "Brew day"]} on={on} cls="w-fit" to={{ Prep: "Brew prep", "Brew day": "Brew day timeline" }} hrefs={hrefs} />;
}

/** Pulled packs (decimals allowed) × pack size, plus loose base units from a partly used bag. A material with no pack
 *  size has one field in its base unit; a line under one pack (showsPacks) has only the loose field. `id` goes on the
 *  first field drawn, which Short focuses. */
export function PackQuantity({ row, onChange, disabled = false, id }: { row: BrewIngredient; onChange: (patch: Partial<Pick<BrewIngredient, "packs" | "loose">>) => void; disabled?: boolean; id?: string }) {
  const unit = (text: string) => <span className="text-sm text-muted-foreground">{text}</span>;
  const packsField = E.edit(`${row.name} packs`, row.packs, "number", undefined, { onChange: packs => onChange({ packs }), min: "0", step: "any", disabled, hideLabel: true, id });
  const looseField = (fieldId?: string) => E.edit(`${row.name} loose ${row.unit}`, row.loose, "number", undefined, { onChange: loose => onChange({ loose }), min: "0", step: "any", disabled, hideLabel: true, id: fieldId });
  let fields: ReactNode;
  if (row.packSize === 1) fields = <>{packsField}{unit(row.unit)}</>;
  else if (showsPacks(row)) fields = <>{packsField}{unit(`× ${row.packSize} ${row.unit}`)}{unit("+")}{looseField()}{unit(row.unit)}</>;
  else fields = <>{looseField(id)}{unit(row.unit)}</>;
  // A Field spans its column; here the fields sit inline with their units.
  return <div className="flex flex-wrap items-center gap-2 [&>[data-slot=field]]:w-fit">{fields}</div>;
}

/** A line's detail with each " · " part kept whole, so a lot code like PIL-2410 never breaks at its hyphen. */
export function DetailParts({ text }: { text: string }) {
  return <>{text.split(" · ").map((part, index) => <Fragment key={index}>{index > 0 && " · "}<span className="whitespace-nowrap">{part}</span></Fragment>)}</>;
}

/** A tab's verbs (and Confirm order's): stuck to the bottom of the phone's scroll so they stay in reach on a long list;
 *  on desk, right-aligned just after the content. The negative margins reach the page column's padding (app-shell's p-4). */
export function BrewFooter({ children }: { children: ReactNode }) {
  return <div className="sticky -bottom-4 z-10 -mx-4 flex flex-col gap-2 border-t bg-background px-4 py-3 md:static md:mx-0 md:flex-row md:items-center md:justify-end md:border-0 md:bg-transparent md:p-0">{children}</div>;
}

/** Reschedule and Cancel plan (planActions), folded at the foot of both tabs so the day's work comes first. Callers draw
 *  it outside their form, so its date field never submits Done pulling or Record brew day. An overdue plan's fold starts
 *  open, and its CHANGE_PLAN_ID anchor is where the Batches row lands, so clearing a stale plan is one tap away (#1582). */
export function ChangePlanFold({ children, open }: { children?: ReactNode; open?: boolean }) {
  if (!children) return null;
  return <details id={CHANGE_PLAN_ID} open={open} className="scroll-m-20 rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Reschedule or cancel</summary><div className="mt-2">{children}</div></details>;
}

/** The planned barrels and date, then the note, as one line under the tabs; nothing when neither is set. */
export function PlannedLine({ planned, note }: { planned?: string; note?: string }) {
  const text = [planned, note].filter(Boolean).join(" · ");
  return text ? E.fld("Planned", text) : null;
}

/** On desk each pull line is one row: name and detail, then its fields at the right (Item wraps them under on a phone). */
const DESK_LINE = "md:[&_[data-slot=item]]:flex-nowrap md:[&_[data-slot=item-footer]]:basis-auto md:[&_[data-slot=item-footer]]:shrink-0 md:[&_[data-slot=item-footer]]:justify-end";

/** A line's exact-source pick among its material's stock (sourceChoices); the caller draws it only when there are choices. */
export function SourcePick({ row, choices, onChange, disabled = false }: {
  row: BrewIngredient; choices: ReturnType<typeof sourceChoices>; onChange: (source: BrewIngredient["source"]) => void; disabled?: boolean;
}) {
  return E.pick("Source", row.source ? materialSourceKey(row.source) : "", choices, { onChange: key => onChange(choices.find(choice => choice.value === key)?.source ?? null), disabled, placeholder: "Choose exact source" });
}

/** Short and Choose lot act in place: Short moves to the line's first amount field to enter what was pulled (Pick's Short
 *  opens the same amount entry); Choose lot opens the line's source pick when `sources` holds stock of its material.
 *  A material with no stock gets no Choose lot: one note above the list (noStockNote) names them all. Without `sources`
 *  (the inventory) Choose lot stays a plain verb. Done pulling is withheld with prepReason beside it; while a line needs
 *  a source, tapping the reason scrolls to the first one (#1508). */
export function BrewPrepView({ model, onChange, onPrint, onSave, messages, planActions, submitting = false, tabHrefs }: {
  model: BrewPrepViewModel;
  onChange?: (patch: Partial<BrewPrepViewModel>) => void;
  onPrint?: () => void;
  /** Done pulling submits the pull form; without it (the inventory) submitting does nothing. */
  onSave?: () => void;
  /** Reschedule / cancel, folded at the foot (ChangePlanFold), outside the pull form. */
  planActions?: ReactNode;
  messages?: ReactNode;
  submitting?: boolean;
  tabHrefs?: Record<string, string>;
}) {
  const id = useId(), [draft, setDraft] = useState(model), [choosing, setChoosing] = useState<string | null>(null);
  const value = onChange ? model : draft;
  const change = (patch: Partial<BrewPrepViewModel>) => { setDraft({ ...value, ...patch }); onChange?.(patch); };
  const patchLine = (key: string, patch: Partial<BrewIngredient>) => change({ ingredients: value.ingredients.map(row => row.key === key ? { ...row, ...patch } : row) });
  const byStage = (stage: BrewDayStage) => value.ingredients.filter(row => row.stage === stage);
  const reason = prepReason(value), noStock = noStockNote(value), unsourced = value.ingredients.find(needsSource);
  const lineId = (key: string) => `${id}-${key}-line`;
  const reasonTap = reason && unsourced
    ? <button type="button" data-preview-action className="text-left underline underline-offset-2" onClick={() => document.getElementById(lineId(unsourced.key))?.scrollIntoView({ block: "center" })}>{reason}</button>
    : reason;
  return <>
    {E.back("Batches", model.title, undefined, model.backHref)}
    <BrewTabs on={0} hrefs={tabHrefs} />
    <PlannedLine planned={model.planned} note={model.note} />
    <form className="contents" onSubmit={event => { event.preventDefault(); if (!submitting && !reason) onSave?.(); }}>
      <div className="md:max-w-sm">{E.pick("Vessel", value.vesselId, vesselOptions(value.vessels), { onChange: vesselId => change({ vesselId }), placeholder: "Choose vessel" })}</div>
      {noStock && E.note(noStock)}
      <div className={DESK_LINE}>
        {BREW_DAY_STAGES.filter(stage => byStage(stage).length).map(stage => <Fragment key={stage}>
          {E.ttl(sentenceCase(stage))}
          {byStage(stage).map(row => {
            const choices = sourceChoices(value.sources ?? [], row.materialId), fieldId = `${id}-${row.key}-qty`;
            return <div key={row.key} id={lineId(row.key)}>
              {E.row(row.name, <DetailParts text={pullDetail(row)} />, "", pullTone(row), undefined, <div className="flex flex-wrap items-center gap-2">
                <PackQuantity row={row} id={fieldId} onChange={patch => patchLine(row.key, patch)} disabled={submitting} />
                {isShort(row) && <Button type="button" size="sm" variant="outline" data-preview-action onClick={() => document.getElementById(fieldId)?.focus()}>Short</Button>}
                {choosing === row.key
                  ? <SourcePick row={row} choices={choices} disabled={submitting} onChange={source => patchLine(row.key, { source })} />
                  : !row.source && (value.sources === undefined || choices.length > 0) && E.submit("Choose lot", { type: "button", size: "sm", variant: "outline", disabled: submitting, onClick: choices.length ? () => setChoosing(row.key) : undefined })}
              </div>)}
            </div>;
          })}
        </Fragment>)}
      </div>
      {E.fld("Later, in cellar", model.later)}
      {messages}
      <BrewFooter>
        <Button type="button" variant="outline" data-preview-action onClick={onPrint}>Print pull list</Button>
        {E.submit("Done pulling", { reason: reasonTap, submitting })}
      </BrewFooter>
    </form>
    <ChangePlanFold open={value.overdue}>{planActions}</ChangePlanFold>
  </>;
}
