// app/(app)/vendors/page.tsx — More › Vendors: suppliers with their typed and
// observed lead time (list_vendors_and_contracts), each editable in
// vendor-form.tsx → upsert_vendor, and below them the Contracts list with the
// four drawdown numbers (committed · received · on order · available),
// editable in contract-form.tsx → upsert_material_contract.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { VendorForm, type Vendor } from "./vendor-form";
import { ContractForm, type Contract } from "./contract-form";

type Observed = { sent_via: string; n: number; avg_lead_days: number; avg_late_days: number | null };
type VendorRow = Vendor & {
  observed: Observed[];
  contracts: (Contract & { material_name: string | null; qty_received: number; qty_on_order: number; qty_available: number })[];
};
type Material = { id: string; name: string; base_uom: string };

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function leadLine(v: VendorRow) {
  const typed = v.lead_time_days === null ? "no lead time typed" : `${v.lead_time_days} day lead`;
  const obs = v.observed.map((o) => `observed ${fmt(o.avg_lead_days)} days (n=${o.n}, ${o.sent_via})`);
  return [typed, ...obs, `${v.contracts.length} ${v.contracts.length === 1 ? "contract" : "contracts"}`].join(" · ");
}

export default async function VendorsPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [vendors, materials] = (await Promise.all([
    runCommand("list_vendors_and_contracts", {}, ctx), runCommand("list_materials", {}, ctx),
  ])) as [VendorRow[], Material[]];
  const options = vendors.map((v) => ({ id: v.id, name: v.name }));
  const contracts = vendors.flatMap((v) => v.contracts.map((c) => ({ ...c, vendor_name: v.name })));

  return (
    <>
      {E.hd("Vendors", "who you buy from", <VendorForm />)}
      {vendors.length === 0
        ? E.blank("No vendors yet")
        : vendors.map((v) => <div key={v.id}>{E.row(v.name, leadLine(v), <VendorForm vendor={v} />, v.active ? "" : "dis")}</div>)}
      {E.ttl("Contracts")}
      <ContractForm vendors={options} materials={materials} />
      {contracts.length === 0
        ? E.blank("No commitments yet")
        : contracts.map((c) => (
            <div key={c.id}>
              {E.row(`${c.vendor_name} · ${c.contract_no ?? c.material_name ?? "contract"}`,
                `${fmt(c.qty_committed)} committed · ${fmt(c.qty_received)} received · ${fmt(c.qty_on_order)} on order · ${fmt(c.qty_available)} available`,
                <ContractForm contract={c} vendors={options} materials={materials} />, c.qty_available <= 0 ? "w" : "")}
            </div>
          ))}
    </>
  );
}
