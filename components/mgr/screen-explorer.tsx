// components/mgr/screen-explorer.tsx — the interactive screen inventory
// (content/docs/screens-explore.mdx). A filterable list of every MGR screen on
// the left, the selected screen's frame and record on the right. The
// selection lives in the URL hash so a link opens straight to a screen. The
// reference page (content/docs/screens.mdx) stays the long, linkable scroll;
// this is for browsing. Filtering is lib/mgr/screen-explorer.ts.
"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { area } from "@/components/mgr/screens";
import { AREAS, filterScreens, type Surface } from "@/lib/mgr/screen-explorer";
import { ScreenFrame, type Mode } from "@/components/mgr/screen-width";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const ALL = "all";
const SURFACES: Surface[] = ["page", "sheet", "entry"];
// The hash as an external store: the static page renders with no selection,
// the client reads #s<index> on hydration, and a later click writes it back.
const onHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const useHashIndex = () => Number(useSyncExternalStore(onHash, () => window.location.hash, () => "").replace(/^#s/, ""));

export function ScreenExplorer() {
  const [q, setQ] = useState("");
  const [areaPick, setArea] = useState(ALL);
  const [surface, setSurface] = useState(ALL);
  const [mode, setMode] = useState<Mode>("phone");
  const hits = useMemo(
    () => filterScreens({ q, area: areaPick === ALL ? undefined : areaPick, surface: surface === ALL ? undefined : (surface as Surface) }),
    [q, areaPick, surface],
  );
  const hashIndex = useHashIndex();
  const [selected, setSelected] = useState<number | null>(null);
  // The selection follows the filter: an unlisted selection moves to the first hit.
  const current = hits.find(([i]) => i === (selected ?? hashIndex)) ?? hits[0];
  const pick = (i: number) => {
    setSelected(i);
    history.replaceState(null, "", `#s${i}`);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const at = hits.findIndex(([i]) => i === current?.[0]);
    const next = hits[at + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) pick(next[0]);
  };

  return (
    <div className="not-prose flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Find a screen" placeholder="Find a screen…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
        <Select value={areaPick} onValueChange={setArea}>
          <SelectTrigger className="w-44" aria-label="Area"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All areas</SelectItem>
            {AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <ToggleGroup type="single" variant="outline" size="sm" value={surface} onValueChange={(v) => v && setSurface(v)} aria-label="Surface">
          <ToggleGroupItem value={ALL}>All</ToggleGroupItem>
          {SURFACES.map((s) => <ToggleGroupItem key={s} value={s} className="capitalize">{s}</ToggleGroupItem>)}
        </ToggleGroup>
        <span className="text-sm text-fd-muted-foreground">{hits.length} screens</span>
        <span className="ml-auto flex items-center gap-2">
          <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as Mode)} aria-label="Width">
            <ToggleGroupItem value="phone">Mobile</ToggleGroupItem>
            <ToggleGroupItem value="desk">Desktop</ToggleGroupItem>
          </ToggleGroup>
          <span className="w-40"><ThemeToggle /></span>
        </span>
      </div>
      {/* Desktop frames need the whole column, so the list moves above them. */}
      <div className={`grid gap-6 ${mode === "desk" ? "" : "md:grid-cols-[14rem_1fr]"}`}>
        <ul role="listbox" aria-label="Screens" tabIndex={0} onKeyDown={onKey} className={`overflow-y-auto rounded-lg border text-sm ${mode === "desk" ? "max-h-[30vh]" : "max-h-[80vh] md:sticky md:top-4"}`}>
          {hits.map(([i, s], n) => {
            const head = n === 0 || area(hits[n - 1][1]) !== area(s);
            return (
              <li key={i} role="option" aria-selected={i === current?.[0]}>
                {head && <div className="sticky top-0 bg-fd-background px-3 pt-3 pb-1 text-xs font-semibold text-fd-muted-foreground">{area(s)}</div>}
                <button type="button" onClick={() => pick(i)} className={`w-full px-3 py-1.5 text-left hover:bg-fd-accent ${i === current?.[0] ? "bg-fd-accent font-medium" : ""}`}>
                  {s.name}
                </button>
              </li>
            );
          })}
          {hits.length === 0 && <li className="p-3 text-fd-muted-foreground">No screen matches.</li>}
        </ul>
        {current && (() => {
          const [i, s] = current;
          return (
            <article className="flex min-w-0 flex-col gap-3">
              <div>
                <div className="font-mono text-xs text-fd-muted-foreground">{area(s)} · {s.surface ?? "page"} · slice {s.slice} · step {s.step}</div>
                <h2 className="text-xl font-semibold">{s.name}</h2>
                <p className="text-sm text-fd-muted-foreground">{s.job}</p>
              </div>
              <dl className="grid gap-1 font-mono text-xs">
                <div><dt className="inline font-semibold">reads </dt><dd className="inline">{s.reads}</dd></div>
                <div><dt className="inline font-semibold">writes </dt><dd className="inline">{s.writes}</dd></div>
              </dl>
              {s.states && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {s.states.map(([state, note], n) => <li key={n}><b className="font-medium">{state}</b>: {note}</li>)}
                </ul>
              )}
              {s.spec && <p className="text-sm">{s.spec}</p>}
              <div className="overflow-x-auto"><ScreenFrame index={i} title={s.name} mode={mode} /></div>
            </article>
          );
        })()}
      </div>
    </div>
  );
}
