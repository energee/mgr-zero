// components/mgr/views/brew-prep.tsx — a batch's Prep tab: the brew-day pull
// list, drawn in the order Pick sheet's format (./pick.tsx). Lines start at plan
// in whole packs plus loose base units; the brewer touches only exceptions.
// Also exports the batch's Prep / Brew day tab bar and the packs + loose field
// that the Brew day timeline (./brew-timeline.tsx) reuses for its Edit.
"use client";
import { Fragment, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { isShort, pullDetail, type BrewDayStage, type BrewIngredient, type BrewPrepViewModel } from "@/lib/mgr/brew-prep-view";
import { BREW_DAY_STAGES } from "@/lib/mgr/recipe-process-view";
import { sentenceCase } from "@/lib/mgr/labels";

export type { BrewPrepViewModel };

/** The batch detail's two tabs; each names the screen it opens in the explorer. */
export function BrewTabs({ on }: { on: 0 | 1 }) {
  return E.tabs(["Prep", "Brew day"], on, "w-fit", { Prep: "Brew prep", "Brew day": "Brew day timeline" });
}

/** Pulled packs (decimals allowed) × pack size, plus loose base units from a partly used bag. */
export function PackQuantity({ row, onChange, disabled = false }: { row: BrewIngredient; onChange: (patch: Partial<Pick<BrewIngredient, "packs" | "loose">>) => void; disabled?: boolean }) {
  const unit = <span className="text-sm text-muted-foreground">{row.packSize === 1 ? row.unit : `× ${row.packSize} ${row.unit}`}</span>;
  // A Field spans its column; here the packs and loose fields sit inline with their units.
  return <div className="flex flex-wrap items-center gap-2 [&>[data-slot=field]]:w-fit">
    {E.edit(`${row.name} packs`, row.packs, "number", undefined, { onChange: packs => onChange({ packs }), min: "0", step: "any", disabled, hideLabel: true })}
    {unit}
    {row.packSize !== 1 && <>
      <span className="text-sm text-muted-foreground">+</span>
      {E.edit(`${row.name} loose ${row.unit}`, row.loose, "number", undefined, { onChange: loose => onChange({ loose }), min: "0", step: "any", disabled, hideLabel: true })}
      <span className="text-sm text-muted-foreground">{row.unit}</span>
    </>}
  </div>;
}

export function BrewPrepView({ model, onChange, onShort, onChooseLot, onPrint, messages, footer, submitting = false }: {
  model: BrewPrepViewModel;
  onChange?: (patch: Partial<BrewPrepViewModel>) => void;
  onShort?: (key: string) => void;
  onChooseLot?: (key: string) => void;
  onPrint?: () => void;
  messages?: ReactNode;
  footer?: ReactNode;
  submitting?: boolean;
}) {
  const [draft, setDraft] = useState(model);
  const value = onChange ? model : draft;
  const change = (patch: Partial<BrewPrepViewModel>) => { setDraft({ ...value, ...patch }); onChange?.(patch); };
  const patchLine = (key: string, patch: Partial<BrewIngredient>) => change({ ingredients: value.ingredients.map(row => row.key === key ? { ...row, ...patch } : row) });
  const byStage = (stage: BrewDayStage) => value.ingredients.filter(row => row.stage === stage);
  return <>
    {E.back("Batches", model.title, undefined, model.backHref)}
    <BrewTabs on={0} />
    {E.info("Lines start at plan in whole packs plus loose pounds. Touch only exceptions.")}
    {E.pick("Vessel", value.vesselId, value.vessels.map(item => ({ value: item.id, label: `${item.name} · ${item.kind} · ${Number(item.capacity_bbl)} bbl` })), { onChange: vesselId => change({ vesselId }), placeholder: "Choose vessel" })}
    {BREW_DAY_STAGES.filter(stage => byStage(stage).length).map(stage => <Fragment key={stage}>
      {E.ttl(sentenceCase(stage))}
      {byStage(stage).map(row => <div key={row.key}>
        {E.row(row.name, pullDetail(row), "", isShort(row) ? "w" : "ok", undefined, <div className="flex flex-wrap items-center gap-2">
          <PackQuantity row={row} onChange={patch => patchLine(row.key, patch)} disabled={submitting} />
          {isShort(row) && <Button type="button" size="sm" variant="outline" data-preview-action onClick={() => onShort?.(row.key)}>Short</Button>}
          {!row.source && E.act("Choose lot", "attention", undefined, onChooseLot && (() => onChooseLot(row.key)))}
        </div>)}
      </div>)}
    </Fragment>)}
    {E.fld("Later, in cellar", model.later)}
    <Button type="button" variant="ghost" className="w-fit" data-preview-action onClick={onPrint}>Print pull list</Button>
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : <Button type="submit" className="w-full md:w-fit md:self-end" disabled={submitting}>{submitting ? "Saving…" : "Done pulling"}</Button>}
  </>;
}
