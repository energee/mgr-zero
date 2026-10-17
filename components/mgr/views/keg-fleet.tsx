// components/mgr/views/keg-fleet.tsx — Keg fleet: pool rows, navigation, and
// shared pool fields. The complete Record keg event surface lives in
// keg-event-form.tsx, mounted by both the inventory fixture and live adapter.
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { KegEventFixtureForm } from "@/components/mgr/views/keg-event-form";
import { KEG_POOL_KINDS } from "@/lib/mgr/enums";
import { KIND_LABEL } from "@/lib/mgr/keg-labels";
import type { KegFleetViewModel, KegOption, KegPoolValue } from "@/lib/mgr/keg-fleet-view";

export { KegEventFields } from "@/components/mgr/views/keg-event-form";
export type { KegFleetViewModel };

const KIND_OPTIONS = KEG_POOL_KINDS.map((value) => ({ value, label: KIND_LABEL[value] }));

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
  /** Live: the complete Record keg event presentation. `model.eventUnavailable` replaces it with the reason. */
  eventForm?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <>
      {E.back("Beer", "Keg fleet", createAction, model.backHref)}
      {(model.shortages ?? []).map((shortage) => <div key={shortage}>{E.note(shortage)}</div>)}
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
      {model.eventUnavailable ? E.gated("Record keg event", model.eventUnavailable) : eventForm !== undefined ? eventForm
        : model.eventForm && model.eventOptions ? <KegEventFixtureForm initialValue={model.eventForm} options={model.eventOptions} /> : null}
      {note}
    </>
  );
}
