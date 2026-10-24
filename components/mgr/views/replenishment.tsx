"use client";

import { Fragment, useId, useMemo, type FormEventHandler, type ReactNode } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { ScopePick } from "@/components/mgr/scope-pick";
import { RecordTable } from "@/components/mgr/views/record-table";
import type { ReplenishmentAllocation, ReplenishmentViewModel } from "@/lib/mgr/replenishment-view";
import { compareSortValues } from "@/lib/mgr/table-sort";
import { replenishmentLines, replenishReason } from "@/lib/replenishment-form";

export type ReplenishmentViewProps = {
  model: ReplenishmentViewModel;
  fromLocationId: string;
  qtys: Record<string, string>;
  onWarehouse?: (id: string) => void;
  onQuantity?: (skuId: string, qty: string) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  quantityActions?: ReactNode;
  releaseAction?: (allocation: ReplenishmentAllocation) => ReactNode;
  feedback?: ReactNode;
  submitAction?: ReactNode;
};

function TransferQuantity({ skuId, sku, value, canEdit, onQuantity }: {
  skuId: string;
  sku: string;
  value: string;
  canEdit: boolean;
  onQuantity?: ReplenishmentViewProps["onQuantity"];
}) {
  const id = useId();
  return <div className="w-40 max-w-full md:ml-auto">{E.edit(`${sku} transfer quantity`, value, "number", undefined, {
    id,
    hideLabel: true,
    disabled: !canEdit,
    min: 0,
    step: "any",
    onChange: (qty) => { if (canEdit) onQuantity?.(skuId, qty); },
  })}</div>;
}

export function ReplenishmentView({
  model,
  fromLocationId,
  qtys,
  onWarehouse,
  onQuantity,
  onSubmit,
  quantityActions,
  releaseAction,
  feedback,
  submitAction,
}: ReplenishmentViewProps) {
  const sourceId = useId();
  const suggestions = useMemo(() => [...model.suggestions].sort((a, b) => compareSortValues(a.sku, b.sku)), [model.suggestions]);
  const allocations = useMemo(() => [...model.allocations].sort((a, b) => compareSortValues(a.sku, b.sku)), [model.allocations]);
  const shortfalls = useMemo(() => [...model.shortfalls].sort((a, b) => compareSortValues(a.detail.title, b.detail.title)), [model.shortfalls]);

  return <>
    {E.back("Finished goods", "Replenishment", undefined, model.backHref)}
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="md:w-64"><ScopePick label="Location" value={model.locationId ?? ""} options={model.locations} /></div>
      {model.locationId && model.canEdit && <div className="flex flex-wrap gap-2">
        {quantityActions !== undefined ? quantityActions : E.btns([["Set taproom par", "g"], ["Set standing allocation", "g"]])}
      </div>}
    </div>

    {E.ttl("Taproom replenishment")}
    {!model.locationId ? E.blank("No taprooms yet: add one under Locations") : <>
      {model.locationName && <p className="text-sm text-muted-foreground">{model.locationName}</p>}
      <form onSubmit={(event) => {
        if (!model.canEdit || !onSubmit) { event.preventDefault(); return; }
        onSubmit(event);
      }} className="flex flex-col gap-4">
        <div className="md:w-64">{E.pick("From warehouse", fromLocationId, model.warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })), {
          id: sourceId,
          placeholder: "Select warehouse",
          disabled: !model.canEdit,
          onChange: (id) => { if (model.canEdit) onWarehouse?.(id); },
          empty: {
            text: "No other location has the Warehouse use. An admin sets a location's Uses in Locations.",
            ...(model.locationsHref ? { label: "Open Locations", href: model.locationsHref } : {}),
          },
        })}</div>
        {suggestions.length ? <RecordTable
          headers={["SKU", "Par", "On hand", "Suggested", "Transfer qty"]}
          align={["l", "r", "r", "r", "r"]}
          rows={suggestions.map((suggestion) => {
            const qty = qtys[suggestion.skuId] ?? "";
            return {
              key: suggestion.skuId,
              href: null,
              cells: [suggestion.sku, suggestion.par, suggestion.onHand, suggestion.suggested,
                <TransferQuantity key="quantity" skuId={suggestion.skuId} sku={suggestion.sku} value={qty} canEdit={model.canEdit} onQuantity={onQuantity} />],
              sort: [suggestion.sku, suggestion.par, suggestion.onHand, suggestion.suggested, qty.trim() === "" ? null : Number(qty)],
            };
          })}
        /> : <p className="text-sm text-muted-foreground">No pars set for this taproom.</p>}
        {feedback}
        {model.canEdit && (submitAction !== undefined ? submitAction : E.submit("Create replenishment order", {
          reason: replenishReason(fromLocationId, replenishmentLines(model.suggestions, qtys)),
          className: "w-fit",
        }))}
      </form>

      {E.ttl("Standing allocations", "standing-allocations")}
      {allocations.length ? <RecordTable
        headers={["SKU", "Reserved", <span key="release" className="sr-only">Release</span>]}
        align={["l", "r", "r"]}
        rows={allocations.map((allocation) => ({
          key: allocation.id,
          href: null,
          cells: [allocation.sku, allocation.qty, model.canEdit ? <Fragment key="release">{releaseAction !== undefined ? releaseAction(allocation) : E.act("Release", "destructive")}</Fragment> : null],
          sort: [allocation.sku, allocation.qty, null],
        }))}
      /> : <p className="text-sm text-muted-foreground">No standing allocations for this taproom.</p>}
    </>}

    {E.ttl("Shortfalls across all locations", "shortfalls")}
    <p className="text-sm text-muted-foreground">Inventory and reservations across all locations, independent of the selected taproom.</p>
    {model.skuFilter && model.allShortfallsHref && <Link href={model.allShortfallsHref} className="text-sm text-muted-foreground underline">All shortfalls</Link>}
    {shortfalls.length ? <RecordTable
      headers={["SKU", "On hand", "Reserved", "ATP", <span key="detail" className="sr-only">Reservations</span>]}
      align={["l", "r", "r", "r", "l"]}
      rows={shortfalls.map((shortfall) => ({
        key: shortfall.skuId,
        href: null,
        cells: [shortfall.detail.title, shortfall.onHand, shortfall.allocated,
          <span key="atp" className={shortfall.atp < 0 ? "text-destructive" : undefined}>{shortfall.atp}</span>,
          <details key="reservations" open={Boolean(model.skuFilter)} className="max-w-64 whitespace-normal wrap-anywhere">
            <summary className="cursor-pointer font-medium underline underline-offset-4">Reservations</summary>
            <div className="mt-2 flex w-64 max-w-full flex-col gap-2">
              {E.num(shortfall.detail.atp, shortfall.detail.atpDetail)}
              {shortfall.detail.rows.map((row) => <Fragment key={row.key}>
                {E.row(row.title, row.detail, E.act("Review", row.tone, row.href))}
              </Fragment>)}
            </div>
          </details>],
        sort: [shortfall.detail.title, shortfall.onHand, shortfall.allocated, shortfall.atp, null],
      }))}
    /> : <p className="text-sm text-muted-foreground">{model.skuFilter ? "This SKU has no current shortfall." : "No current shortfalls across all locations."}</p>}
  </>;
}
