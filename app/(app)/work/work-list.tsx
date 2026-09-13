// app/(app)/work/work-list.tsx — the Work landing's chip bar and rows. The
// chips are the kinds the role may open; an explicit chip choice is remembered
// per browser under mgr-work-filter so the page reopens where it was left.
"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { WorkView } from "@/components/mgr/views/work";
import { WORK_CHIPS as CHIPS, workFromQuery } from "@/lib/mgr/work-view";
import type { WorkKind, WorkRow } from "@/lib/commands/landings";

const KEY = "mgr-work-filter";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const remembered = (): "all" | WorkKind => {
  try { const v = localStorage.getItem(KEY); return v && CHIPS.includes(v as WorkKind) ? (v as WorkKind) : "all"; } catch { return "all"; }
};

export function WorkList({ rows, defaults, subtitle, createAction, chips }: { rows: WorkRow[]; defaults: WorkKind[]; subtitle: string; createAction: ReactNode; chips: string[] }) {
  // The server renders "all"; the browser's remembered chip takes over after hydration.
  const chip = useSyncExternalStore(subscribe, remembered, () => "all");
  const pick = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* no storage */ } listeners.forEach((fn) => fn()); };
  return <WorkView model={{ ...workFromQuery(rows, subtitle, defaults), workChips: chips }} chip={chips.includes(chip) ? chip : "all"} onChip={pick} createAction={createAction} />;
}
