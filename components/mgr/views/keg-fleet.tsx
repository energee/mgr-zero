// components/mgr/views/keg-fleet.tsx — Keg fleet: Record keg event as the
// header action, pool rows with Add keg pool below them, navigation, and
// shared pool fields. The complete Record keg event surface lives in
// keg-event-form.tsx, mounted by both the inventory fixture and live adapter.
"use client";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { KegEventFixtureForm } from "@/components/mgr/views/keg-event-form";
import { KEG_POOL_KINDS } from "@/lib/mgr/enums";
import { KIND_LABEL } from "@/lib/mgr/keg-labels";
import { kegPoolFieldErrors, type KegFleetViewModel, type KegOption, type KegPoolValue } from "@/lib/mgr/keg-fleet-view";
import { useTouchedLines } from "@/lib/mgr/touched-lines";

export { KegEventFields } from "@/components/mgr/views/keg-event-form";

const KIND_OPTIONS = KEG_POOL_KINDS.map((value) => ({ value, label: KIND_LABEL[value] }));

/** Add/Edit keg pool. `editing` fixes the kind (it cannot change after
 *  creation) and offers In service. Without onChange the fields draw the
 *  value uncontrolled, as the inventory does. Each money field says which
 *  pools it applies to (#1119). */
export function KegPoolFields({ value, vendors, editing = false, onChange, attempted = false }: {
  value: KegPoolValue; vendors: KegOption[]; editing?: boolean; onChange?: (next: KegPoolValue) => void; attempted?: boolean;
}) {
  const set = <K extends keyof KegPoolValue>(key: K) => onChange ? (next: KegPoolValue[K]) => onChange({ ...value, [key]: next }) : undefined;
  const touched = useTouchedLines(!onChange);
  const errors = kegPoolFieldErrors(value);
  // update_keg_pool keeps a stored per-fill cost when the field is cleared, so Edit never says to leave it blank.
  const perFillRequired = value.kind === "pay_per_fill";
  let perFillHelp = "Optional for this pool. Blank means not set, not $0.00.";
  if (perFillRequired) {
    perFillHelp = "Required: what the vendor charges for each keg filled. Enter 0.00 only if the cost is known to be zero.";
  } else if (editing) {
    perFillHelp = "Optional for this pool. An unset cost is not $0.00. Once set, it can be changed but not removed.";
  }
  return (
    <>
      {E.edit("Pool name", value.name, "text", undefined, { id: "pool-name", onChange: set("name"), required: true })}
      {E.pick("Kind", value.kind, KIND_OPTIONS, { id: "pool-kind", onChange: set("kind") as ((v: string) => void) | undefined, disabled: editing })}
      {value.kind === "owned"
        ? E.fld("Vendor", "None · the brewery owns these kegs")
        : E.pick("Vendor", value.vendorId, vendors, { id: "pool-vendor", onChange: set("vendorId"), placeholder: "Select a vendor", required: true })}
      <div className="flex min-w-0 flex-col gap-2">
        {E.edit(`Per-fill cost ($) · ${perFillRequired ? "required" : "optional"}`, value.perFill, "number", undefined, { id: "pool-per-fill", min: 0, step: 0.01, placeholder: perFillRequired ? "Enter cost" : "Not set", onChange: set("perFill"), onBlur: () => touched.touch(0), error: attempted || touched.shown(0) ? errors.perFill : undefined, required: perFillRequired, "aria-describedby": "pool-per-fill-help" })}
        <FieldDescription id="pool-per-fill-help">{perFillHelp}</FieldDescription>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {E.edit("Deposit per keg ($)", value.deposit, "number", undefined, { id: "pool-deposit", min: 0, step: 0.01, onChange: set("deposit"), onBlur: () => touched.touch(1), error: attempted || touched.shown(1) ? errors.deposit : undefined, "aria-describedby": "pool-deposit-help" })}
        <FieldDescription id="pool-deposit-help">Charged on wholesale orders for each keg from this pool. Defaults to $0.00: no deposit.</FieldDescription>
      </div>
      {editing && <label className="flex items-center gap-2 text-sm">{E.sw(value.active, "In service", set("active"))}In service</label>}
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
  /** Live: the complete Record keg event presentation, drawn as the header action. `model.eventUnavailable` replaces it with the reason under the header. */
  eventForm?: ReactNode;
  note?: ReactNode;
}) {
  // Recording an event is the daily verb, so it is the header action: the live
  // form, else the inventory's fixture form, and nothing while eventUnavailable
  // names why. Adding a pool is rare and sits below the pools (#1584).
  const fixtureEvent = model.eventForm && model.eventOptions ? <KegEventFixtureForm initialValue={model.eventForm} options={model.eventOptions} /> : null;
  const liveOrFixtureEvent = eventForm !== undefined ? eventForm : fixtureEvent;
  const recordEvent = model.eventUnavailable ? null : liveOrFixtureEvent;
  return (
    <>
      {E.back("Beer", "Keg fleet", recordEvent, model.backHref)}
      {model.eventUnavailable && E.gated("Record keg event", model.eventUnavailable)}
      {(model.shortages ?? []).map((shortage) => <div key={shortage}>{E.note(shortage)}</div>)}
      {model.pools ? <>
        {model.pools.length ? model.pools.map((pool) => <div key={pool.key}>
          {E.row(pool.title, pool.detail, poolActions?.[pool.key])}
          {pool.bins.map((row) => <div key={row.key}>{E.row(row.title, row.detail, row.qty)}</div>)}
        </div>) : E.blank(model.empty)}
        {createAction && <div className="flex md:justify-end">{createAction}</div>}
      </> : (
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
      {note}
    </>
  );
}
