// components/mgr/views/release.tsx — the Release for ordering sheet (portal
// releases, docs/plans/portal-release-windows.md), shared by the inventory
// record and the live ReleaseForm on Planning and the SKU list. It draws the
// source (a planned batch, or for one SKU a pick of packaged stock and its
// planned batches), each SKU's quantity with a switch to leave it out, and the
// ships-from and order-by dates. EditReleaseView is the Edit release sheet an
// open release's row opens on the SKU list.
"use client";

import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ReleaseForm } from "@/lib/mgr/release-view";

export type ReleaseControls = {
  source?: (key: string) => void;
  include?: (index: number, on: boolean) => void;
  qty?: (index: number, value: string) => void;
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
  // A batch form names each package on its quantity, even when one is left.
  const named = several || Boolean(form.batchId);
  return <>
    {sources && sources.length > 1
      ? E.pick("Release from", form.key, sources.map((s) => ({ value: s.key, label: s.source })), { onChange: controls.source })
      : E.fld("Release from", form.source)}
    {form.lines.map((line, index) => <Fragment key={line.skuId}>
      {/* A batch releases every projected SKU; untick one to leave it out. */}
      {several ? E.row(line.name, line.include ? "released" : "left out", E.sw(line.include, `Release ${line.name}`, controls.include && ((on) => controls.include?.(index, on)))) : null}
      {line.include ? E.edit(named ? `${line.name} · quantity` : "Quantity", line.qty, "number", undefined, { onChange: controls.qty && ((value) => controls.qty?.(index, value)), min: 1, step: 1, required: true }) : null}
    </Fragment>)}
    {E.edit("Ships from", form.shipsFrom, "date", undefined, { onChange: controls.shipsFrom, required: true })}
    {E.edit("Order by (optional)", form.ordersCloseOn, "date", undefined, { onChange: controls.ordersCloseOn })}
    {messages}
    {footer !== undefined ? footer : E.btn("Release for ordering")}
  </>;
}

/** Edit release: a new quantity (never below what is confirmed) and order-by date. */
export function EditReleaseView({ qty, ordersCloseOn, confirmed, controls = {}, messages, footer }: {
  qty: string; ordersCloseOn: string;
  /** Units already confirmed on the release: the lowest quantity it can take. */
  confirmed: number;
  controls?: { qty?: (value: string) => void; ordersCloseOn?: (value: string) => void };
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  return <>
    {E.edit("Quantity", qty, "number", undefined, { onChange: controls.qty, min: Math.max(confirmed, 1), step: 1, required: true })}
    {confirmed ? <p className="text-sm text-muted-foreground">{confirmed} already confirmed: the lowest it can go. Pre-orders above a lower quantity are flagged on Confirm order.</p> : null}
    {E.edit("Order by (optional)", ordersCloseOn, "date", undefined, { onChange: controls.ordersCloseOn })}
    {messages}
    {footer !== undefined ? footer : E.btn("Save release")}
  </>;
}
