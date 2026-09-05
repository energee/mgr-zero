// components/mgr/screen-explorer.tsx — the interactive screen inventory
// (content/docs/screens-explore.mdx). A filterable list of every MGR screen on
// the left, the selected screen drawn inline in its real shell on the right,
// and taps inside it walk to the next screen (lib/mgr/screen-links.ts decides
// where a label goes). A sheet opens over the page it was reached from, inside
// this box; dismissing it goes back. The whole view is the URL hash
// (lib/mgr/screen-explorer.ts parseHash/buildHash): screen, persona, search and
// filters, so a link reopens the same view and the browser's back button
// retraces the walk. The shell answers to the window width, so the phone
// toggle swaps in the /screens/frame iframe at 390px (a preview: taps in it do
// not walk, and it draws the default person). The reference page
// (content/docs/screens.mdx) stays the long, linkable scroll; this is for
// browsing. Filtering is lib/mgr/screen-explorer.ts.
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { area } from "@/components/mgr/screens";
import { AREAS, buildHash, filterScreens, pageUnder, parseHash, screenByName, type HashState, type Surface } from "@/lib/mgr/screen-explorer";
import { deniedFor, homeFor, LANDINGS, PERSONAS, personaFor } from "@/lib/mgr/demo-personas";
import { asPersona } from "@/components/mgr/demo-screens";
import type { StaffRole } from "@/lib/commands/registry";
import { BACK, resolveTap } from "@/lib/mgr/screen-links";
import { ScreenFrame, ScreenSheet } from "@/components/mgr/screen-frame";
import { screenSlug } from "@/components/mgr/screen-index";
import { ScreenIframe } from "@/components/mgr/screen-width";
import { SCREENS, WORK_TABS } from "@/components/mgr/screens";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const ALL = "all";
const SURFACES: Surface[] = ["page", "sheet", "entry"];
// The hash as an external store: the static page renders with no selection,
// the client reads the hash on hydration, and every control writes it back.
const onHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const useHash = () => useSyncExternalStore(onHash, () => window.location.hash, () => "");
const write = (state: HashState, push: boolean) => {
  history[push ? "pushState" : "replaceState"](null, "", buildHash(state));
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

export function ScreenExplorer() {
  const view = parseHash(useHash());
  const q = view.q ?? "";
  const areaPick = view.a ?? ALL;
  const surface = view.f ?? ALL;
  // The demo user the shell is drawn as (lib/mgr/demo-personas.ts). Chosen
  // outside the app, like signing in as a test account: their face and role's
  // rail, their own Today, and a refusal where their role may not go.
  const persona = personaFor((view.p ?? PERSONAS[0].role) as StaffRole);
  const [phone, setPhone] = useState(false);
  // The screen the persona was last refused, for Permission denied's copy.
  const [refused, setRefused] = useState<string>();
  const hits = filterScreens({ q, area: areaPick === ALL ? undefined : areaPick, surface: surface === ALL ? undefined : (surface as Surface) });
  // The walk so far (inventory indexes), for the page a sheet opens over, for
  // going back when the browser history has nothing of ours to pop, and drawn
  // as the trail above the frame. The ref is read synchronously in handlers;
  // the state copy is what renders.
  const trail = useRef<number[]>([]);
  const [walk, setWalk] = useState<number[]>([]);
  // The page under the current sheet, fixed at navigation time (a ref cannot
  // be read during render); a hash the browser restores falls back to the
  // sheet's own area.
  const [under, setUnder] = useState<number | null>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const list = useRef<HTMLUListElement>(null);
  // The selection follows the filter: an unlisted selection moves to the first hit.
  const current = hits.find(([i]) => i === view.s) ?? hits[0];
  const set = (patch: HashState) => write({ ...view, s: current?.[0], ...patch }, false);
  const go = (i: number, push: boolean, patch: HashState = {}) => {
    // A deep-linked screen was never walked to; it is the ground of the first
    // tap and where dismissing that tap's sheet goes back to.
    if (!trail.current.length && current) trail.current.push(current[0]);
    setUnder(pageUnder(trail.current, i));
    trail.current.push(i);
    setWalk([...trail.current]);
    write({ ...view, ...patch, s: i }, push);
    // Keyboard reach: Tab now continues into the drawing, not back to the list.
    box?.focus({ preventScroll: true });
  };
  const pick = (i: number) => go(i, true);
  // A new persona: refused where they are if their role may not open it, else
  // their own Today when a landing is on view, else the same screen as them.
  const choose = (role: StaffRole) => {
    const p = personaFor(role);
    const name = current?.[1].name;
    if (name && deniedFor(role, name)) {
      setRefused(name);
      const denied = screenByName("Permission denied");
      if (denied) return go(denied[0], true, { p: role });
    } else if (name && LANDINGS.includes(name)) {
      const home = screenByName(homeFor(p.role));
      if (home) return go(home[0], true, { p: role });
    }
    set({ p: role });
  };
  const back = () => {
    trail.current.pop();
    const prev = trail.current.pop();
    setWalk([...trail.current]);
    if (prev !== undefined) history.back();
    else if (current) go(pageUnder([], current[0]), true);
  };
  // One handler for every tap in the drawing: the nearest link, button or row
  // gives the label (a row's title, not its whole text); a resolved name opens
  // that screen. A tab that names a screen of its own (data-to, the Work chips)
  // opens it; any other tab filters the rows under it in place. Chips only
  // ever switch in place. Capture phase, and propagation stops on a hit, so
  // the shell's Next.js links never navigate the docs page and the Me
  // control's own sheet never opens outside the box.
  const onTap = (e: React.MouseEvent) => {
    if (!current) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("a, button, [data-slot=item]");
    if (!el || el.matches("[data-slot=toggle-group-item]")) return;
    if (el.matches("[role=tab]") && !el.dataset.to) return filterRows(el);
    const link = el.closest("a");
    const label = el.getAttribute("aria-label") ?? (el.matches("[data-slot=item]") ? el.querySelector("[data-slot=item-title]")?.textContent : el.textContent) ?? "";
    const name = resolveTap(current[1], label, link?.getAttribute("href"), el.getAttribute("data-to"));
    if (link || name) e.preventDefault();
    if (!name) {
      if (process.env.NODE_ENV !== "production") console.debug(`[screen-explorer] no screen for "${label}" on ${current[1].name}`);
      return;
    }
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
  // Tabs that open a screen this persona may not: hidden, as the app would.
  const hidden = Object.values(WORK_TABS).filter((n) => deniedFor(persona.role, n)).map((n) => `.screen-box [data-to="${n}"]{display:none}`).join("");
  // The selected row stays in view when a tap or a link lands far down the list.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current]);
  // Navigation rows (the "Open" chevron: More, Settings) lead to screens; the
  // ones this persona may not open are hidden, as the rail hides them. A DOM
  // pass because a drawing is opaque JSX. ponytail: a body drawn per role
  // would replace this; today no body re-renders its rows after mount.
  useEffect(() => {
    if (!box || !current) return;
    for (const row of box.querySelectorAll<HTMLElement>("[data-slot=item]:has([aria-label=Open])")) {
      const title = row.querySelector("[data-slot=item-title]")?.textContent ?? "";
      const name = resolveTap(current[1], title);
      row.hidden = Boolean(name && name !== BACK && deniedFor(persona.role, name));
    }
  }, [box, current, persona]);

  return (
    <div className="not-prose flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Find a screen" placeholder="Find a screen…" value={q} onChange={(e) => set({ q: e.target.value })} className="w-56" />
        <Select value={areaPick} onValueChange={(v) => set({ a: v === ALL ? undefined : v })}>
          <SelectTrigger className="w-44" aria-label="Area"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All areas</SelectItem>
            {AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <ToggleGroup type="single" variant="outline" size="sm" value={surface} onValueChange={(v) => v && set({ f: v === ALL ? undefined : v })} aria-label="Surface">
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
        <ToggleGroup type="single" variant="outline" size="sm" value={phone ? "phone" : "desk"} onValueChange={(v) => v && setPhone(v === "phone")} aria-label="Width">
          <ToggleGroupItem value="desk">Desk</ToggleGroupItem>
          <ToggleGroupItem value="phone">Phone</ToggleGroupItem>
        </ToggleGroup>
        <span className="ml-auto w-40"><ThemeToggle /></span>
      </div>
      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        <ul ref={list} role="listbox" aria-label="Screens" tabIndex={0} onKeyDown={onKey} className="max-h-[80vh] overflow-y-auto rounded-lg border text-sm md:sticky md:top-4">
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
              </div>
              {walk.length > 1 && (
                <nav aria-label="Walk" className="flex flex-wrap items-center gap-1 text-xs text-fd-muted-foreground">
                  <Button type="button" variant="outline" size="sm" onClick={back}>Back</Button>
                  {walk.map((i, n) => <span key={n}>{n > 0 && <span className="mx-1">›</span>}{SCREENS[i].name}</span>)}
                </nav>
              )}
              {phone ? (
                <ScreenIframe index={current[0]} title={s.name} mode="phone" />
              ) : (
                /* The transform makes this box the containing block for the shell's
                   fixed-position rail, so it draws here and not over the docs
                   sidebar. */
                <div ref={setBox} tabIndex={-1} onClickCapture={onTap} className="screen-box relative h-[80svh] overflow-auto rounded-lg border outline-none [transform:translateZ(0)]">
                  {hidden && <style>{hidden}</style>}
                  {s.surface === "sheet" ? (
                    <>
                      <ScreenFrame screen={SCREENS[under ?? pageUnder([], current[0])]} persona={persona} />
                      {box && <ScreenSheet screen={s} container={box} onClose={back} />}
                    </>
                  ) : (
                    <ScreenFrame screen={s} persona={persona} />
                  )}
                </div>
              )}
              <p className="text-sm text-fd-muted-foreground">{s.job}</p>
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
              <p className="flex gap-4 text-xs">
                <a className="underline" href={`/docs/screens#${screenSlug(s.name)}`}>In the inventory</a>
                <a className="underline" href={`/screens/frame/${current[0]}`} target="_blank" rel="noreferrer">Frame alone</a>
              </p>
            </article>
          );
        })()}
      </div>
    </div>
  );
}

// An in-place tab bar (order states, inventory kinds) filters the rows below
// it: a row stays when its text mentions the tab, every row stays for an "all"
// tab or when nothing would. ponytail: text matching stands in for data the
// drawings do not carry; rows tagged with their state would replace it.
function filterRows(tab: HTMLElement) {
  const label = tab.textContent?.trim().toLowerCase() ?? "";
  // The rows live in the nearest ancestor that has any (a bar may sit in a
  // wrapper beside a second bar), and never in the tab bar itself.
  let scope = tab.closest<HTMLElement>("[data-slot=tabs]")?.parentElement ?? null;
  while (scope && !scope.querySelector("[data-slot=item]")) scope = scope.parentElement;
  const rows = [...(scope?.querySelectorAll<HTMLElement>("[data-slot=item]") ?? [])];
  const keep = label.startsWith("all") ? rows : rows.filter((r) => (r.textContent ?? "").toLowerCase().includes(label));
  for (const r of rows) r.hidden = keep.length > 0 && !keep.includes(r);
}
