// components/mgr/screen-explorer.tsx — the interactive screen inventory
// (content/docs/screens-explore.mdx). A filterable list of every MGR screen on
// the left, the selected screen drawn inline in its real shell on the right,
// and taps inside it walk to the next screen (lib/mgr/screen-links.ts decides
// where a label goes). A sheet opens over the page it was reached from, inside
// this box; dismissing it goes back. The selection is the URL hash, pushed on
// every tap, so a link opens straight to a screen and the browser's back button
// retraces the walk. No iframe: the shell answers to the window width, so
// resize the window for the phone layout. The reference page
// (content/docs/screens.mdx) stays the long, linkable scroll; this is for
// browsing. Filtering is lib/mgr/screen-explorer.ts.
"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { area } from "@/components/mgr/screens";
import { AREAS, filterScreens, pageUnder, screenByName, type Surface } from "@/lib/mgr/screen-explorer";
import { deniedFor, homeFor, LANDINGS, PERSONAS, personaFor } from "@/lib/mgr/demo-personas";
import { asPersona } from "@/components/mgr/demo-screens";
import type { StaffRole } from "@/lib/commands/registry";
import { BACK, resolveTap } from "@/lib/mgr/screen-links";
import { ScreenFrame, ScreenSheet } from "@/components/mgr/screen-frame";
import { SCREENS } from "@/components/mgr/screens";
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
  // The demo user the shell is drawn as (lib/mgr/demo-personas.ts). Chosen
  // outside the app, like signing in as a test account: their face and role's
  // rail, their own Today, and a refusal where their role may not go.
  const [persona, setPersona] = useState(PERSONAS[0]);
  // The screen the persona was last refused, for Permission denied's copy.
  const [refused, setRefused] = useState<string>();
  const hits = useMemo(
    () => filterScreens({ q, area: areaPick === ALL ? undefined : areaPick, surface: surface === ALL ? undefined : (surface as Surface) }),
    [q, areaPick, surface],
  );
  const hashIndex = useHashIndex();
  // The walk so far (inventory indexes), for the page a sheet opens over and
  // for going back when the browser history has nothing of ours to pop.
  const trail = useRef<number[]>([]);
  // The page under the current sheet, fixed at navigation time (a ref cannot
  // be read during render); a hash the browser restores falls back to the
  // sheet's own area.
  const [under, setUnder] = useState<number | null>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  // The selection follows the filter: an unlisted selection moves to the first hit.
  const current = hits.find(([i]) => i === hashIndex) ?? hits[0];
  const go = (i: number, push: boolean) => {
    setUnder(pageUnder(trail.current, i));
    trail.current.push(i);
    history[push ? "pushState" : "replaceState"](null, "", `#s${i}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  const pick = (i: number) => go(i, true);
  // A new persona lands on their own Today when a landing is on view.
  const choose = (role: StaffRole) => {
    const p = personaFor(role);
    setPersona(p);
    if (current && LANDINGS.includes(current[1].name)) {
      const home = screenByName(homeFor(p.role));
      if (home) go(home[0], true);
    }
  };
  const back = () => {
    trail.current.pop();
    const prev = trail.current.pop();
    if (prev !== undefined) history.back();
    else if (current) go(pageUnder([], current[0]), true);
  };
  // One handler for every tap in the drawing: the nearest link, button or row
  // gives the label (a row's title, not its whole text); a resolved name opens
  // that screen. Tabs and chips only ever switch in place. Capture phase, and
  // propagation stops on a hit, so the shell's Next.js links never navigate
  // the docs page and the Me control's own sheet never opens outside the box.
  const onTap = (e: React.MouseEvent) => {
    if (!current) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("a, button, [data-slot=item]");
    if (!el || el.matches("[role=tab], [data-slot=toggle-group-item]")) return;
    const link = el.closest("a");
    const label = el.getAttribute("aria-label") ?? (el.matches("[data-slot=item]") ? el.querySelector("[data-slot=item-title]")?.textContent : el.textContent) ?? "";
    const name = resolveTap(current[1], label, link?.getAttribute("href"), el.getAttribute("data-to"));
    if (link || name) e.preventDefault();
    if (!name) return;
    e.stopPropagation();
    if (name === BACK) return back();
    const home = name === "Today" ? homeFor(persona.role) : name;
    const denied = deniedFor(persona.role, home);
    if (denied) setRefused(home);
    const hit = screenByName(denied ? "Permission denied" : home);
    if (hit) pick(hit[0]);
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
        <Select value={persona.role} onValueChange={(v) => choose(v as StaffRole)}>
          <SelectTrigger className="w-48" aria-label="Persona"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERSONAS.map((p) => <SelectItem key={p.role} value={p.role}>{p.name} · {p.role}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-auto w-40"><ThemeToggle /></span>
      </div>
      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        <ul role="listbox" aria-label="Screens" tabIndex={0} onKeyDown={onKey} className="max-h-[80vh] overflow-y-auto rounded-lg border text-sm md:sticky md:top-4">
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
          const s = asPersona(current[1], persona, refused);
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
              {/* The transform makes this box the containing block for the shell's
                  fixed-position rail, so it draws here and not over the docs
                  sidebar. ponytail: the shell still reads the window for its
                  phone/desktop split; container queries in AppShell would let a
                  narrow box draw the phone layout. */}
              <div ref={setBox} onClickCapture={onTap} className="relative h-[80svh] overflow-auto rounded-lg border [transform:translateZ(0)]">
                {s.surface === "sheet" ? (
                  <>
                    <ScreenFrame screen={SCREENS[under ?? pageUnder([], current[0])]} persona={persona} />
                    {box && <ScreenSheet screen={s} container={box} onClose={back} />}
                  </>
                ) : (
                  <ScreenFrame screen={s} persona={persona} />
                )}
              </div>
            </article>
          );
        })()}
      </div>
    </div>
  );
}
