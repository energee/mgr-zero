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
import { isShort, pullDetail, pullTone, sourceChoices, type BrewDayStage, type BrewIngredient, type BrewPrepViewModel } from "@/lib/mgr/brew-prep-view";
import { vesselOptions } from "@/lib/mgr/brew-day-view";
import { materialSourceKey } from "@/lib/mgr/material-source";
import { BREW_DAY_STAGES } from "@/lib/mgr/recipe-process-view";
import { sentenceCase } from "@/lib/mgr/labels";

export type { BrewPrepViewModel };

/** The batch detail's two tabs; each names the screen it opens in the explorer.
 *  Live passes `hrefs` (the batch page's `?tab=` links), so a tab opens its page; the inventory's tabs stay inert. */
export function BrewTabs({ on, hrefs }: { on: 0 | 1; hrefs?: Record<string, string> }) {
  return <TabBar names={["Prep", "Brew day"]} on={on} cls="w-fit" to={{ Prep: "Brew prep", "Brew day": "Brew day timeline" }} hrefs={hrefs} />;
}

/** Pulled packs (decimals allowed) × pack size, plus loose base units from a partly used bag. `id` goes on the packs field. */
export function PackQuantity({ row, onChange, disabled = false, id }: { row: BrewIngredient; onChange: (patch: Partial<Pick<BrewIngredient, "packs" | "loose">>) => void; disabled?: boolean; id?: string }) {
  const unit = <span className="text-sm text-muted-foreground">{row.packSize === 1 ? row.unit : `× ${row.packSize} ${row.unit}`}</span>;
  // A Field spans its column; here the packs and loose fields sit inline with their units.
  return <div className="flex flex-wrap items-center gap-2 [&>[data-slot=field]]:w-fit">
    {E.edit(`${row.name} packs`, row.packs, "number", undefined, { onChange: packs => onChange({ packs }), min: "0", step: "any", disabled, hideLabel: true, id })}
    {unit}
    {row.packSize !== 1 && <>
      <span className="text-sm text-muted-foreground">+</span>
      {E.edit(`${row.name} loose ${row.unit}`, row.loose, "number", undefined, { onChange: loose => onChange({ loose }), min: "0", step: "any", disabled, hideLabel: true })}
      <span className="text-sm text-muted-foreground">{row.unit}</span>
    </>}
  </div>;
}

/** A line's exact-source pick among its material's stock (sourceChoices); the caller draws it only when there are choices. */
export function SourcePick({ row, choices, onChange, disabled = false }: {
  row: BrewIngredient; choices: ReturnType<typeof sourceChoices>; onChange: (source: BrewIngredient["source"]) => void; disabled?: boolean;
}) {
  return E.pick("Source", row.source ? materialSourceKey(row.source) : "", choices, { onChange: key => onChange(choices.find(choice => choice.value === key)?.source ?? null), disabled, placeholder: "Choose exact source" });
}

/** Short and Choose lot act in place: Short moves to the line's packs field to enter what was pulled (Pick's Short
 *  opens the same amount entry); Choose lot opens the line's source pick when `sources` holds stock of its material,
 *  and is disabled when `sources` is given but holds none. Without `sources` (the inventory) it stays a plain verb. */
export function BrewPrepView({ model, onChange, onPrint, onSave, messages, footer, planActions, submitting = false, disabled = false, tabHrefs }: {
  model: BrewPrepViewModel;
  onChange?: (patch: Partial<BrewPrepViewModel>) => void;
  onPrint?: () => void;
  /** Done pulling submits the pull form; without it (the inventory) submitting does nothing. */
  onSave?: () => void;
  /** Reschedule / cancel, drawn under the title and outside the pull form so its own fields never submit Done pulling. */
  planActions?: ReactNode;
  messages?: ReactNode;
  footer?: ReactNode;
  submitting?: boolean;
  /** A validation gate (canSavePrep) disables Done pulling without claiming an in-flight command, as PickView's does. */
  disabled?: boolean;
  tabHrefs?: Record<string, string>;
}) {
  const id = useId(), [draft, setDraft] = useState(model), [choosing, setChoosing] = useState<string | null>(null);
  const value = onChange ? model : draft;
  const change = (patch: Partial<BrewPrepViewModel>) => { setDraft({ ...value, ...patch }); onChange?.(patch); };
  const patchLine = (key: string, patch: Partial<BrewIngredient>) => change({ ingredients: value.ingredients.map(row => row.key === key ? { ...row, ...patch } : row) });
  const byStage = (stage: BrewDayStage) => value.ingredients.filter(row => row.stage === stage);
  return <>
    {E.back("Batches", model.title, undefined, model.backHref)}
    {planActions}
    <form className="contents" onSubmit={event => { event.preventDefault(); if (!submitting && !disabled) onSave?.(); }}>
      <BrewTabs on={0} hrefs={tabHrefs} />
      {E.info("Lines start at plan in whole packs plus loose pounds. Touch only exceptions.")}
      {E.pick("Vessel", value.vesselId, vesselOptions(value.vessels), { onChange: vesselId => change({ vesselId }), placeholder: "Choose vessel" })}
      {BREW_DAY_STAGES.filter(stage => byStage(stage).length).map(stage => <Fragment key={stage}>
        {E.ttl(sentenceCase(stage))}
        {byStage(stage).map(row => {
          const choices = sourceChoices(value.sources ?? [], row.materialId), packsId = `${id}-${row.key}-packs`;
          return <div key={row.key}>
            {E.row(row.name, pullDetail(row), "", pullTone(row), undefined, <div className="flex flex-wrap items-center gap-2">
              <PackQuantity row={row} id={packsId} onChange={patch => patchLine(row.key, patch)} disabled={submitting} />
              {isShort(row) && <Button type="button" size="sm" variant="outline" data-preview-action onClick={() => document.getElementById(packsId)?.focus()}>Short</Button>}
              {choosing === row.key
                ? <SourcePick row={row} choices={choices} disabled={submitting} onChange={source => patchLine(row.key, { source })} />
                : !row.source && E.act("Choose lot", "attention", undefined, choices.length ? () => setChoosing(row.key) : undefined, submitting || (value.sources !== undefined && !choices.length))}
            </div>)}
          </div>;
        })}
      </Fragment>)}
      {E.fld("Later, in cellar", model.later)}
      <Button type="button" variant="ghost" className="w-fit" data-preview-action onClick={onPrint}>Print pull list</Button>
      {messages}
      {E.sp()}
      {footer !== undefined ? footer : <Button type="submit" className="w-full md:w-fit md:self-end" disabled={submitting || disabled}>{submitting ? "Saving…" : "Done pulling"}</Button>}
    </form>
  </>;
}
