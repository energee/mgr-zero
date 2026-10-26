// app/(app)/work/work-list.tsx — the Work landing's chip bar and rows. Role
// chips filter rows or link to standalone tasks; only an explicit filter choice
// is remembered per browser under mgr-work-filter.
"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { WorkView } from "@/components/mgr/views/work";
import { WORK_FILTER_CHIPS as CHIPS, WORK_HREFS, workFromQuery } from "@/lib/mgr/work-view";
import type { WorkKind, WorkRow } from "@/lib/commands/landings";

const KEY = "mgr-work-filter";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const remembered = (): "all" | WorkKind => {
  try { const v = localStorage.getItem(KEY); return v && CHIPS.includes(v as WorkKind) ? (v as WorkKind) : "all"; } catch { return "all"; }
};

export function WorkList({ rows, defaults, createAction, chips }: { rows: WorkRow[]; defaults: WorkKind[]; createAction: ReactNode; chips: string[] }) {
  // The server renders "all"; the browser's remembered chip takes over after hydration.
  const chip = useSyncExternalStore(subscribe, remembered, () => "all");
  const pick = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* no storage */ } listeners.forEach((fn) => fn()); };
  const workHrefs = Object.fromEntries(Object.entries(WORK_HREFS).filter(([name]) => chips.includes(name) && !CHIPS.includes(name)));
  return <WorkView model={{ ...workFromQuery(rows, defaults), workChips: chips.filter(name => CHIPS.includes(name)), workHrefs }} chip={chip} onChip={pick} createAction={createAction} />;
}
