// components/mgr/views/release.tsx — the Release for ordering sheet (portal
// releases, docs/plans/portal-release-windows.md), shared by the inventory
// record and the live ReleaseForm on Planning and the SKU list. It draws the
// source (a planned batch, or for one SKU a pick of packaged stock and its
// planned batches), then for a batch the barrels open to wholesale and a switch
// per package, or for stock each SKU's quantity, and the ships-from and
// order-by dates. EditReleaseView is the Edit release sheet an open release's
// row opens on the SKU list.
"use client";

import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { bbl, type ReleaseForm } from "@/lib/mgr/release-view";

export type ReleaseControls = {
  source?: (key: string) => void;
  include?: (index: number, on: boolean) => void;
  qty?: (index: number, value: string) => void;
  wholesaleBbl?: (value: string) => void;
  shipsFrom?: (value: string) => void;
  ordersCloseOn?: (value: string) => void;
};

export function ReleaseView({ form, sources, controls = {}, messages, footer }: {
  form: ReleaseForm;
  /** One SKU's choice of source (skuReleaseForms); absent draws the form's one source. */
  sources?: ReleaseForm[];
  controls?: ReleaseControls;
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  const several = form.lines.length > 1;
  // A batch releases barrels, not units: one pool that every ticked package draws from.
  const pool = form.batchId !== undefined;
  return <>
    {sources && sources.length > 1
      ? E.pick("Release from", form.key, sources.map((s) => ({ value: s.key, label: s.source })), { onChange: controls.source })
      : E.fld("Release from", form.source)}
    {pool ? <>
      {E.edit("Open to wholesale (bbl)", form.wholesaleBbl ?? "", "number", undefined, { onChange: controls.wholesaleBbl, min: 0.01, max: form.plannedBbl, step: 0.01, required: true })}
      <p className="text-sm text-muted-foreground">Of {bbl(form.plannedBbl ?? 0)} bbl planned. Every package below draws from these barrels; the rest covers the taprooms and a short yield.</p>
    </> : null}
    {form.lines.map((line, index) => <Fragment key={line.skuId}>
      {/* A batch releases every package of its beer; untick one to leave it out. A lone batch package is named so the sheet says what opens. */}
      {several ? E.row(line.name, line.include ? "released" : "left out", E.sw(line.include, `Release ${line.name}`, controls.include && ((on) => controls.include?.(index, on)))) : pool ? E.fld("Package", line.name) : null}
      {line.include && !pool ? E.edit(several ? `${line.name} · quantity` : "Quantity", line.qty, "number", undefined, { onChange: controls.qty && ((value) => controls.qty?.(index, value)), min: 1, step: 1, required: true }) : null}
    </Fragment>)}
    {E.edit("Ships from", form.shipsFrom, "date", undefined, { onChange: controls.shipsFrom, required: true })}
    {E.edit("Order by (optional)", form.ordersCloseOn, "date", undefined, { onChange: controls.ordersCloseOn })}
    {messages}
    {footer !== undefined ? footer : E.btn("Release for ordering")}
  </>;
}

/** Edit release: a new quantity (never below what is confirmed) and order-by
 *  date. With `pool` (a batch release with a pool) it also edits the batch's
 *  barrels open to wholesale, and the quantity becomes the package's own
 *  optional limit. */
export function EditReleaseView({ qty, ordersCloseOn, confirmed, pool, controls = {}, messages, footer }: {
  qty: string; ordersCloseOn: string;
  /** Units already confirmed on the release: the lowest quantity it can take. */
  confirmed: number;
  pool?: { wholesaleBbl: string; plannedBbl?: number | null };
  controls?: { qty?: (value: string) => void; ordersCloseOn?: (value: string) => void; wholesaleBbl?: (value: string) => void };
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  return <>
    {pool ? <>
      {E.edit("Open to wholesale (bbl)", pool.wholesaleBbl, "number", undefined, { onChange: controls.wholesaleBbl, min: 0.01, max: pool.plannedBbl ?? undefined, step: 0.01, required: true })}
      <p className="text-sm text-muted-foreground">Shared by every package of this batch{pool.plannedBbl != null ? `, of ${bbl(pool.plannedBbl)} bbl planned` : ""}.</p>
    </> : null}
    {E.edit(pool ? "Package limit (optional)" : "Quantity", qty, "number", undefined, { onChange: controls.qty, min: Math.max(confirmed, 1), step: 1, required: !pool })}
    {confirmed ? <p className="text-sm text-muted-foreground">{confirmed} already confirmed: the lowest it can go. Pre-orders above a lower quantity are flagged on Confirm order.</p> : null}
    {E.edit("Order by (optional)", ordersCloseOn, "date", undefined, { onChange: controls.ordersCloseOn })}
    {messages}
    {footer !== undefined ? footer : E.btn("Save release")}
  </>;
}
