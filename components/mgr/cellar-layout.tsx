"use client";
// components/mgr/cellar-layout.tsx — Cellar's Tiles / Rows switch. The page
// draws its tanks both ways; this shows one and keeps the choice in this
// browser's localStorage, so it survives a reading round and the next visit.
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const KEY = "mgr-cellar-layout";
const noSubscribe = () => () => {};

/** The saved layout. Blocked storage (a private window) means no saved choice, so Tiles. */
function savedLayout(): string {
  try { return localStorage.getItem(KEY) ?? "Tiles"; } catch { return "Tiles"; }
}

export function CellarLayout({ tiles, rows }: { tiles: ReactNode; rows: ReactNode }) {
  // The server cannot read localStorage: it and hydration draw Tiles, then the saved choice.
  const saved = useSyncExternalStore(noSubscribe, savedLayout, () => "Tiles");
  const [picked, setPicked] = useState<string>();
  const layout = picked ?? saved;
  const pick = (value: string) => {
    if (!value) return;
    setPicked(value);
    // Blocked storage only costs remembering the choice; the switch still works.
    try { localStorage.setItem(KEY, value); } catch { /* not remembered */ }
  };
  return <>
    <div className="flex justify-end">
      <ToggleGroup type="single" size="sm" value={layout} onValueChange={pick} aria-label="Layout">
        <ToggleGroupItem value="Tiles">Tiles</ToggleGroupItem>
        <ToggleGroupItem value="Rows">Rows</ToggleGroupItem>
      </ToggleGroup>
    </div>
    {layout === "Rows" ? rows : tiles}
  </>;
}
