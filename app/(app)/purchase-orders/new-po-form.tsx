// app/(app)/purchase-orders/new-po-form.tsx — the live New PO page: holds the
// draft, withholds Save draft with the reason newPoReason names, and submits
// create_purchase_order. `today` is breweryDate(timeZone), so a past Expected date warns.
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { NewPoView } from "@/components/mgr/views/new-po";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { newPoReason } from "@/lib/mgr/new-po-view";
import { toCents } from "@/lib/mgr/money";

type Vendor = { id: string; name: string };
type Material = { id: string; name: string; purchase_uom: string; lot_tracked: boolean };
type Line = { materialId: string; qty: string; cost: string; lot: string };
const EMPTY: Line = { materialId: "", qty: "", cost: "", lot: "" };

export function NewPoForm({ vendors, materials, today }: { vendors: Vendor[]; materials: Material[]; today: string }) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState("");
  const [expectedOn, setExpectedOn] = useState("");
  const [lines, setLines] = useState<Line[]>([EMPTY]);
  const reason = newPoReason({ vendor: vendorId, lines });
  const action = useCommandAction();
  const set = (index: number, patch: Partial<Line>) => setLines(prev => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  return <form className="flex flex-col gap-3" onSubmit={event => {
    event.preventDefault();
    if (action.busy || reason) return;
    void action.run("create_purchase_order", {
      vendorId, expectedOn: expectedOn || undefined,
      lines: lines.map(line => ({
        materialId: line.materialId, qtyOrdered: Number(line.qty),
        unitCostCents: toCents(line.cost),
        expectedLotCode: line.lot.trim() || undefined,
      })),
    }, () => router.push("/purchase-orders"));
  }}>
    <NewPoView model={{
      backHref: "/purchase-orders", vendorsHref: "/vendors", materialsHref: "/materials", vendor: vendorId, vendors, materials, expected: expectedOn, today,
      lines: lines.map((line, index) => {
        const material = materials.find(item => item.id === line.materialId);
        return { key: String(index), materialId: line.materialId, title: material?.name ?? "", detail: material ? `${material.purchase_uom} · ${material.lot_tracked ? "lot-tracked" : "not lot-tracked"}` : "", qty: line.qty, cost: line.cost, lot: material?.lot_tracked ? line.lot : undefined };
      }),
    }} controls={{
      vendor: setVendorId, expected: setExpectedOn,
      material: (index, materialId) => set(index, { materialId, lot: "" }),
      quantity: (index, qty) => set(index, { qty }), cost: (index, cost) => set(index, { cost }), lot: (index, lot) => set(index, { lot }),
      add: () => setLines(prev => [...prev, EMPTY]),
      remove: index => setLines(prev => prev.filter((_, i) => i !== index)),
    }} submitting={action.busy} reason={reason} messages={<CommandFormMessage error={action.error} />} />
  </form>;
}
