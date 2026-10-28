// app/(app)/purchase-orders/new-po-form.tsx — the live New PO page: holds the
// draft, withholds Save draft with the reason newPoReason names, and submits
// create_purchase_order. Save and mark sent then runs send_purchase_order
// (sent from a mail client, the draft page's default) and opens the PO; if
// that second step fails, the error says the draft is saved and links it.
// Once a vendor is chosen, its materials lead the picker (vendorMaterialsFirst).
// A line whose vendor and material have one contract in force
// (onlyActiveContract) starts at that contract's cost and draws it down; with
// several, the cost stays blank and no contract is sent (#1507).
// `today` is breweryDate(timeZone): a past Expected date warns, and it decides
// which contracts are in force.
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { NewPoView } from "@/components/mgr/views/new-po";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { newPoReason, onlyActiveContract, vendorMaterialsFirst, type PoContract } from "@/lib/mgr/new-po-view";
import { dollarsInput, toCents } from "@/lib/mgr/money";

type Vendor = { id: string; name: string };
type Material = { id: string; name: string; purchase_uom: string; lot_tracked: boolean; default_vendor_id: string | null };
type Line = { materialId: string; qty: string; cost: string; lot: string };
const EMPTY: Line = { materialId: "", qty: "", cost: "", lot: "" };

export function NewPoForm({ vendors, contracts, materials, today }: { vendors: Vendor[]; contracts: PoContract[]; materials: Material[]; today: string }) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState("");
  const [expectedOn, setExpectedOn] = useState("");
  const [lines, setLines] = useState<Line[]>([EMPTY]);
  // The draft Save and mark sent saved before marking it sent failed: no second save.
  const [unsentId, setUnsentId] = useState<string | null>(null);
  const reason = unsentId ? "The draft is saved. Open it to mark it sent." : newPoReason({ vendor: vendorId, lines });
  const action = useCommandAction();
  const set = (index: number, patch: Partial<Line>) => setLines(prev => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  const contractFor = (materialId: string) => onlyActiveContract(contracts, vendorId, materialId, today);
  const contractCost = (materialId: string) => dollarsInput(contractFor(materialId)?.unit_cost_cents);
  const input = () => ({
    vendorId, expectedOn: expectedOn || undefined,
    lines: lines.map(line => ({
      materialId: line.materialId, qtyOrdered: Number(line.qty),
      unitCostCents: toCents(line.cost),
      contractId: contractFor(line.materialId)?.id,
      expectedLotCode: line.lot.trim() || undefined,
    })),
  });
  async function saveAndSend() {
    if (action.busy || reason) return;
    let poId = "";
    if (!await action.run("create_purchase_order", input(), data => { poId = (data as { id: string }).id; }, { refresh: false })) return;
    if (await action.run("send_purchase_order", { poId, sentVia: "mailto" }, undefined, { refresh: false })) router.push(`/purchase-orders/${poId}`);
    else setUnsentId(poId);
  }
  return <form className="flex flex-col gap-3" onSubmit={event => {
    event.preventDefault();
    if (action.busy || reason) return;
    void action.run("create_purchase_order", input(), () => router.push("/purchase-orders"));
  }}>
    <NewPoView model={{
      backHref: "/purchase-orders", vendorsHref: "/vendors", materialsHref: "/materials", vendor: vendorId, vendors, materials: vendorMaterialsFirst(materials, vendorId), expected: expectedOn, today,
      lines: lines.map((line, index) => {
        const material = materials.find(item => item.id === line.materialId);
        return { key: String(index), materialId: line.materialId, title: material?.name ?? "", detail: material ? `${material.purchase_uom} · ${material.lot_tracked ? "lot-tracked" : "not lot-tracked"}` : "", qty: line.qty, cost: line.cost, lot: material?.lot_tracked ? line.lot : undefined };
      }),
    }} controls={{
      vendor: setVendorId, expected: setExpectedOn,
      material: (index, materialId) => set(index, { materialId, lot: "", cost: contractCost(materialId) }),
      quantity: (index, qty) => set(index, { qty }), cost: (index, cost) => set(index, { cost }), lot: (index, lot) => set(index, { lot }),
      add: () => setLines(prev => [...prev, EMPTY]),
      remove: index => setLines(prev => prev.filter((_, i) => i !== index)),
      saveAndSend: () => { void saveAndSend(); },
    }} submitting={action.busy} reason={reason} messages={<>
      <CommandFormMessage error={unsentId && action.error ? `The draft is saved, but it was not marked sent: ${action.error}` : action.error} />
      {unsentId && E.btn("Open the draft", "g", `/purchase-orders/${unsentId}`)}
    </>} />
  </form>;
}
