"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { NewPoView } from "@/components/mgr/views/new-po";
import { useCommandAction } from "@/lib/commands/use-command-form";

type Vendor = { id: string; name: string };
type Material = { id: string; name: string; purchase_uom: string; lot_tracked: boolean };
type Line = { materialId: string; qty: string; cost: string; lot: string };
const EMPTY: Line = { materialId: "", qty: "", cost: "", lot: "" };

export function NewPoForm({ vendors, materials }: { vendors: Vendor[]; materials: Material[] }) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState("");
  const [expectedOn, setExpectedOn] = useState("");
  const [lines, setLines] = useState<Line[]>([EMPTY]);
  const valid = lines.filter(line => line.materialId && Number(line.qty) > 0);
  const action = useCommandAction();
  const set = (index: number, patch: Partial<Line>) => setLines(prev => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  return <form className="flex flex-col gap-3" onSubmit={event => {
    event.preventDefault();
    if (action.busy || !vendorId || !valid.length) return;
    void action.run("create_purchase_order", {
      vendorId, expectedOn: expectedOn || undefined,
      lines: valid.map(line => ({
        materialId: line.materialId, qtyOrdered: Number(line.qty),
        unitCostCents: line.cost === "" ? undefined : Math.round(Number(line.cost) * 100),
        expectedLotCode: line.lot.trim() || undefined,
      })),
    }, () => router.push("/purchase-orders"));
  }}>
    <NewPoView model={{
      backHref: "/purchase-orders", vendor: vendorId, vendors, materials, expected: expectedOn,
      lines: lines.map((line, index) => {
        const material = materials.find(item => item.id === line.materialId);
        return { key: String(index), materialId: line.materialId, title: material?.name ?? "", detail: material ? `${material.purchase_uom} · ${material.lot_tracked ? "lot-tracked" : "not lot-tracked"}` : "", qty: line.qty, cost: line.cost, lot: material?.lot_tracked ? line.lot : undefined };
      }),
    }} controls={{
      vendor: setVendorId, expected: setExpectedOn,
      material: (index, materialId) => set(index, { materialId, lot: "" }),
      quantity: (index, qty) => set(index, { qty }), cost: (index, cost) => set(index, { cost }), lot: (index, lot) => set(index, { lot }),
      add: () => setLines(prev => [...prev, EMPTY]),
    }} submitting={action.busy} disabled={!vendorId || !valid.length} messages={<CommandFormMessage error={action.error} />} />
  </form>;
}
