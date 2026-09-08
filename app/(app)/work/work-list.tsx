// app/(app)/work/work-list.tsx — the Work landing's chip bar and rows. The
// chips are the kinds the role may open; an explicit chip choice is remembered
// per browser under mgr-work-filter so the page reopens where it was left.
"use client";

import { useSyncExternalStore } from "react";
import { DeliveryTruck01Icon, Package01Icon, Route01Icon, ThermometerIcon } from "@hugeicons/core-free-icons";
import { E } from "@/components/mgr/e";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkKind, WorkRow } from "@/lib/commands/landings";

const CHIPS: ("all" | WorkKind)[] = ["all", "orders", "transfers", "batches", "runs", "POs", "routes"];
const ICON: Record<WorkKind, typeof Package01Icon> = { orders: Package01Icon, transfers: Package01Icon, batches: ThermometerIcon, runs: Package01Icon, POs: DeliveryTruck01Icon, routes: Route01Icon };
const KEY = "mgr-work-filter";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const remembered = (): "all" | WorkKind => {
  try { const v = localStorage.getItem(KEY); return v && CHIPS.includes(v as WorkKind) ? (v as WorkKind) : "all"; } catch { return "all"; }
};

export function WorkList({ rows, defaults }: { rows: WorkRow[]; defaults: WorkKind[] }) {
  // The server renders "all"; the browser's remembered chip takes over after hydration.
  const chip = useSyncExternalStore(subscribe, remembered, () => "all");
  const pick = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* no storage */ } listeners.forEach((fn) => fn()); };
  const shown = rows.filter((r) => (chip === "all" ? defaults.includes(r.kind) : r.kind === chip));
  return (
    <>
      <Tabs value={chip} onValueChange={pick} className="min-w-0">
        <TabsList variant="solid" className="w-full">{CHIPS.map((c) => <TabsTrigger key={c} value={c}>{c}</TabsTrigger>)}</TabsList>
      </Tabs>
      {shown.length === 0 ? E.blank("Nothing in motion") : shown.map((r) => (
        <div key={r.href}>{E.row(r.label, r.detail, E.act(r.verb, r.tone, r.href), r.tone === "attention" ? "w" : "", ICON[r.kind])}</div>
      ))}
    </>
  );
}
