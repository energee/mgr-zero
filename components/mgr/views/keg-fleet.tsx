// components/mgr/views/keg-fleet.tsx — Keg fleet: pool rows, navigation, and
// the pool and event fields. The inventory draws the fields inline from the
// fixture; live mounts the same KegPoolFields / KegEventFields inside its
// command forms (app/(app)/kegs/pool-form.tsx, event-form.tsx) and passes them
// through the createAction, poolActions and eventForm slots.
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { KEG_EVENT_REASONS, KEG_POOL_KINDS, KEG_SIZES } from "@/lib/mgr/enums";
import { KIND_LABEL, REASON_LABEL, SIZE_LABEL } from "@/lib/mgr/keg-labels";
import { mayHaveKegCustomer, needsKegCustomer, type KegEventOptions, type KegEventValue, type KegFleetViewModel, type KegOption, type KegPoolValue } from "@/lib/mgr/keg-fleet-view";

export type { KegFleetViewModel };

const KIND_OPTIONS = KEG_POOL_KINDS.map((value) => ({ value, label: KIND_LABEL[value] }));
const SIZE_OPTIONS = KEG_SIZES.map((value) => ({ value, label: SIZE_LABEL[value] }));
const REASON_CHIPS = KEG_EVENT_REASONS.map((r) => REASON_LABEL[r]);

/** Add/Edit keg pool. `editing` fixes the kind (it cannot change after
 *  creation) and offers In service. Without onChange the fields draw the
 *  value uncontrolled, as the inventory does. */
export function KegPoolFields({ value, vendors, editing = false, onChange }: {
  value: KegPoolValue; vendors: KegOption[]; editing?: boolean; onChange?: (next: KegPoolValue) => void;
}) {
  const set = <K extends keyof KegPoolValue>(key: K) => onChange ? (next: KegPoolValue[K]) => onChange({ ...value, [key]: next }) : undefined;
  return (
    <>
      {E.edit("Pool name", value.name, "text", undefined, { id: "pool-name", onChange: set("name"), required: true })}
      {E.pick("Kind", value.kind, KIND_OPTIONS, { id: "pool-kind", onChange: set("kind") as ((v: string) => void) | undefined, disabled: editing })}
      {value.kind === "owned"
        ? E.fld("Vendor", "None · owned pools have no vendor")
        : E.pick("Vendor", value.vendorId, vendors, { id: "pool-vendor", onChange: set("vendorId"), placeholder: "Select a vendor", required: true })}
      {E.edit("Per-fill cost ($)", value.perFill, "number", undefined, { id: "pool-per-fill", min: 0, step: 0.01, onChange: set("perFill"), required: value.kind === "pay_per_fill" })}
      {E.edit("Deposit per keg ($)", value.deposit, "number", undefined, { id: "pool-deposit", min: 0, step: 0.01, onChange: set("deposit") })}
      {editing && <label className="flex items-center gap-2 text-sm">{E.sw(value.active, "In service", set("active"))}In service</label>}
    </>
  );
}

/** Record keg event: pool, size, reason, where the kegs are, the customer
 *  when the reason moves kegs to or from one, and how many. */
export function KegEventFields({ value, options, preview, onChange }: {
  value: KegEventValue; options: KegEventOptions; preview?: ReactNode; onChange?: (next: KegEventValue) => void;
}) {
  const set = <K extends keyof KegEventValue>(key: K) => onChange ? (next: KegEventValue[K]) => onChange({ ...value, [key]: next }) : undefined;
  const reasonIndex = KEG_EVENT_REASONS.indexOf(value.reason);
  return (
    <>
      {E.pick("Keg pool", value.poolId, options.pools, { id: "keg-pool", onChange: set("poolId"), placeholder: "Select a pool" })}
      {E.pick("Size", value.kegSize, SIZE_OPTIONS, { id: "keg-size", onChange: set("kegSize") as ((v: string) => void) | undefined })}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Reason</span>
        {E.chips(REASON_CHIPS, reasonIndex, false, onChange ? { onChange: (i) => onChange({ ...value, reason: KEG_EVENT_REASONS[i] }), label: "Reason" } : undefined)}
      </div>
      {E.pick(value.reason === "shipped" ? "Shipped from" : value.reason === "returned" ? "Returned to" : "Location", value.locationId, options.locations,
        { id: "keg-location", onChange: set("locationId"), placeholder: "Select a location" })}
      {E.pick("Bin", value.binId, options.bins, { id: "keg-bin", onChange: set("binId"), disabled: !value.locationId, placeholder: "Select a bin" })}
      {mayHaveKegCustomer(value.reason) && E.pick(needsKegCustomer(value.reason) ? "Customer" : "Customer (optional)", value.customerId, options.customers,
        { id: "keg-customer", onChange: set("customerId"), placeholder: "Select a customer" })}
      {E.edit("Kegs", value.qty, "number", undefined, { id: "keg-qty", min: 1, step: 1, onChange: set("qty"), required: true })}
      {E.edit("Note", value.note, "text", undefined, { id: "keg-note", onChange: set("note") })}
      {preview ? E.info(preview) : null}
      {E.note("Empty kegs only. Beer coming back with a keg, and its credit, is Return shipment. A deposit refund is a separate credit memo.")}
    </>
  );
}

export function KegFleetView({
  model,
  createAction,
  poolActions,
  eventForm,
  note,
}: {
  model: KegFleetViewModel;
  createAction?: ReactNode;
  poolActions?: Record<string, ReactNode>;
  /** Live: the Record keg event form. `model.eventUnavailable` replaces it with the reason. */
  eventForm?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <>
      {E.back("Beer", "Keg fleet", createAction, model.backHref)}
      {model.pools ? (model.pools.length ? model.pools.map((pool) => <div key={pool.key}>
        {E.row(pool.title, pool.detail, poolActions?.[pool.key])}
        {pool.bins.map((row) => <div key={row.key}>{E.row(row.title, row.detail, row.qty)}</div>)}
      </div>) : E.blank(model.empty)) : (
        <>
          {model.poolForm && <KegPoolFields value={model.poolForm} vendors={model.vendors ?? []} editing />}
          {E.btns([["Add keg pool", "g"], ["Save keg pool", "g"]])}
          {(model.bins ?? []).map((row) => (
            <Fragment key={row.key}>{E.row(row.title, row.detail, row.qty)}</Fragment>
          ))}
        </>
      )}
      {model.navRows ? model.navRows.map((row) => <Link key={row.key} href={row.href}>{E.nav(row.title, row.detail)}</Link>) : (
        <>
          {E.nav("Customer keg balance", model.customerBalance ?? "")}
          {E.nav("Keg report", model.report ?? "")}
          {E.nav("Keg event history", model.history ?? "")}
        </>
      )}
      {model.eventUnavailable ? E.gated("Record keg event", model.eventUnavailable) : eventForm !== undefined ? eventForm : (
        <>
          {model.eventForm && model.eventOptions && <KegEventFields value={model.eventForm} options={model.eventOptions} preview={model.eventPreview && <>Preview: +{model.eventPreview.qty} returned · {model.eventPreview.name} {model.eventPreview.from} {E.arrow()} {model.eventPreview.to} out</>} />}
          {E.btn("Record keg event", "irr")}
        </>
      )}
      {note}
    </>
  );
}
