// components/mgr/screen-explorer.tsx — the interactive screen inventory
// (content/docs/screens-explore.mdx). A filterable list of every MGR screen on
// the left, the selected screen drawn inline in its real shell on the right,
// and taps inside it walk to the next screen (lib/mgr/screen-links.ts decides
// where a label goes). A sheet opens over the page it was reached from, inside
// this box; dismissing it goes back. The whole view is the URL hash
// (lib/mgr/screen-explorer.ts parseHash/buildHash): screen, persona, search,
// filters and width, so a link reopens the same view; the trail follows the
// hash, so the browser's back button retraces the walk. The shell answers to
// the window width, so the phone toggle swaps in the /screens/frame iframe at
// 390px (a preview: it draws the same persona but its taps do not walk). The
// reference page (content/docs/screens.mdx) stays the long, linkable scroll;
// this is for browsing. Filtering is lib/mgr/screen-explorer.ts.
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { area } from "@/components/mgr/screens";
import { AREAS, buildHash, filterScreens, pageUnder, parseHash, screenByName, type HashState, type Indexed, type Surface } from "@/lib/mgr/screen-explorer";
import { deniedFor, homeFor, PERSONAS, personaFor } from "@/lib/mgr/demo-personas";
import { asPersona } from "@/components/mgr/demo-screens";
import type { StaffRole } from "@/lib/commands/registry";
import { BACK, resolveTap } from "@/lib/mgr/screen-links";
import { ScreenFrame, ScreenSheet } from "@/components/mgr/screen-frame";
import { screenSlug } from "@/components/mgr/screen-index";
import { ScreenIframe, syncFrames } from "@/components/mgr/screen-width";
import { SCREENS, WORK_TABS } from "@/components/mgr/screens";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const ALL = "all";
const SURFACES: Surface[] = ["page", "sheet", "entry"];
const DENIED = "Permission denied";
// The landings the persona switch swaps for the new role's own; Driver and
// Taproom stay put for a role that may open them.
const HOMES = ["Today", "Sales", "Brewer"];
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
const byIndex = (i?: number): Indexed | undefined => (i !== undefined && SCREENS[i] && !SCREENS[i].venue ? [i, SCREENS[i]] : undefined);

export function ScreenExplorer() {
  const view = parseHash(useHash());
  const q = view.q ?? "";
  const areaPick = view.a ?? ALL;
  const surface = view.f ?? ALL;
  const phone = view.w === "phone";
  // The demo user the shell is drawn as (lib/mgr/demo-personas.ts). Chosen
  // outside the app, like signing in as a test account: their face and role's
  // rail, their own Today, and a refusal where their role may not go.
  const persona = personaFor((view.p ?? PERSONAS[0].role) as StaffRole);
  // The screen the persona was last refused, for Permission denied's copy.
  const [refused, setRefused] = useState<string>();
  // Hits in area order, as the inventory page groups them, so each area heads
  // its rows once.
  const hits = filterScreens({ q, area: areaPick === ALL ? undefined : areaPick, surface: surface === ALL ? undefined : (surface as Surface) })
    .sort((a, b) => AREAS.indexOf(area(a[1])) - AREAS.indexOf(area(b[1])));
  // The walk so far (inventory indexes), for the page a sheet opens over, for
  // Back, and drawn as the trail above the frame. The ref is read
  // synchronously in handlers; the state copy is what renders.
  const trail = useRef<number[]>([]);
  const [walk, setWalk] = useState<number[]>([]);
  // The page under the current sheet, fixed at navigation time (a ref cannot
  // be read during render); a hash the browser restores falls back to the
  // sheet's own area.
  const [under, setUnder] = useState<number | null>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const list = useRef<HTMLUListElement>(null);
  // The link's screen is the one drawn even when the filter no longer lists
  // it (a walk can leave the filtered set); with no link, the first hit.
  const current = byIndex(view.s) ?? hits[0];
  const listed = current && hits.some(([i]) => i === current[0]);
  // Filters write themselves and keep the reader's pick.
  const set = (patch: HashState) => write({ ...view, ...patch }, false);
  const go = (i: number, push: boolean, patch: HashState = {}, fresh = false) => {
    // A deep-linked screen was never walked to; it is the ground of the first
    // tap and where dismissing that tap's sheet goes back to.
    if (fresh) trail.current = [];
    else if (!trail.current.length && current) trail.current.push(current[0]);
    setUnder(pageUnder(trail.current, i));
    const seen = trail.current.indexOf(i);
    if (seen >= 0) trail.current.length = seen;
    trail.current.push(i);
    setWalk([...trail.current]);
    write({ ...view, ...patch, s: i }, push);
  };
  // From the list: a new start, focus stays where it was. From a tap in the
  // frame: one more step, and Tab continues into the drawing.
  const pick = (i: number) => go(i, true, {}, true);
  const step = (i: number) => {
    go(i, true);
    box?.focus({ preventScroll: true });
  };
  // A new persona: back to the screen they were refused if this role may open
  // it, their own Today when another role's landing is on view, else the same
  // screen as them (drawn as a refusal if their role may not open it).
  const choose = (role: StaffRole) => {
    const name = current?.[1].name;
    if (name === DENIED && refused && !deniedFor(role, refused)) {
      const back = screenByName(refused);
      if (back) return go(back[0], true, { p: role }, true);
    }
    if (name && HOMES.includes(name)) {
      const home = screenByName(homeFor(role));
      if (home) return go(home[0], true, { p: role }, true);
    }
    set({ p: role });
  };
  const back = () => {
    trail.current.pop();
    const prev = trail.current.at(-1);
    if (prev !== undefined) go(prev, true);
    else if (current) go(pageUnder([], current[0]), false, {}, true);
    box?.focus({ preventScroll: true });
  };
  // One handler for every tap in the drawing: the nearest link, button or row
  // gives the label (a row's title, else its text: a tile has no title); a
  // resolved name opens that screen. A rail group label names its landing. A
  // tab that names a screen of its own (data-to, the Work chips) opens it; any
  // other tab filters the rows under it in place. Chips and gated rows only
  // ever act in place. Capture phase, and propagation stops on a hit, so the
  // shell's Next.js links never navigate the docs page and the Me control's
  // own sheet never opens outside the box.
  const onTap = (e: React.MouseEvent) => {
    if (!current) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("a, button, [data-slot=item]");
    if (!el || el.matches("[data-slot=toggle-group-item]")) return;
    if (el.closest("[data-gated]")) return e.preventDefault();
    const link = el.closest("a");
    const label = el.getAttribute("aria-label") ?? (el.matches("[data-slot=item]") ? el.querySelector("[data-slot=item-title]")?.textContent : null) ?? el.textContent ?? "";
    if (label.trim() === "Pay invoice") return e.preventDefault();
    const group = el.closest("[data-slot=sidebar-group-label]") && screenByName(label.trim());
    const name = group ? label.trim() : resolveTap(current[1], label, link?.getAttribute("href"), el.getAttribute("data-to"));
    if (el.matches("[role=tab]") && (!name || name === current[1].name)) return filterRows(el);
    if (link || name) e.preventDefault();
    // Nowhere to go, or a verb named like the sheet it sits in ("Record
    // movement" on Record movement): it acts here.
    if (!name || name === current[1].name) return actInPlace(el, label, back, trail.current.length > 1);
    e.stopPropagation();
    if (name === BACK) return back();
    const home = name === "Today" ? homeFor(persona.role) : name;
    const denied = deniedFor(persona.role, home);
    if (denied) setRefused(home);
    const hit = screenByName(denied ? DENIED : home);
    if (hit) step(hit[0]);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") return box?.focus({ preventScroll: true });
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const at = hits.findIndex(([i]) => i === current?.[0]);
    const next = hits[at + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) pick(next[0]);
  };
  // Tabs that open a screen this persona may not: hidden, as the app would.
  const hidden = Object.values(WORK_TABS).filter((n) => deniedFor(persona.role, n)).map((n) => `.screen-box [data-to="${n}"]{display:none}`).join("");
  // The browser's back and forward move the hash without us: the trail is cut
  // back to that screen when it is on it, else starts over there.
  useEffect(() => {
    const s = view.s;
    if (s === undefined || trail.current.at(-1) === s) return;
    const at = trail.current.indexOf(s);
    trail.current = at >= 0 ? trail.current.slice(0, at + 1) : [s];
    setWalk([...trail.current]);
  }, [view.s]);
  // The selected row stays in view when a tap or a link lands far down the list.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current]);
  // Navigation rows (the "Open" chevron: More, Settings) lead to screens; the
  // ones this persona may not open are hidden, as the rail hides them. A DOM
  // pass because a drawing is opaque JSX; the frame is keyed by screen so no
  // row outlives its screen. ponytail: a body drawn per role would replace this.
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
        <span className="text-sm text-fd-muted-foreground">{hits.length} {hits.length === 1 ? "screen" : "screens"}</span>
        <Select value={persona.role} onValueChange={(v) => choose(v as StaffRole)}>
          <SelectTrigger className="w-48" aria-label="Persona"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERSONAS.map((p) => <SelectItem key={p.role} value={p.role}>{p.name} · {p.role}</SelectItem>)}
          </SelectContent>
        </Select>
        <ToggleGroup type="single" variant="outline" size="sm" value={phone ? "phone" : "desk"} onValueChange={(v) => v && set({ w: v === "phone" ? "phone" : undefined })} aria-label="Width">
          <ToggleGroupItem value="desk">Desk</ToggleGroupItem>
          <ToggleGroupItem value="phone">Phone</ToggleGroupItem>
        </ToggleGroup>
        <span className="w-full md:ml-auto md:w-40" onClick={() => queueMicrotask(syncFrames)}><ThemeToggle /></span>
      </div>
      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        {/* One tab stop: the selected row is focusable, arrows move the selection, Enter steps into the frame. */}
        <ul ref={list} role="listbox" aria-label="Screens" onKeyDown={onKey} className="max-h-48 overflow-y-auto rounded-lg border text-sm md:sticky md:top-4 md:max-h-[80vh]">
          {hits.flatMap(([i, s], n) => {
            const head = n === 0 || area(hits[n - 1][1]) !== area(s);
            const selected = i === current?.[0];
            return [
              head && <li key={`h${i}`} role="presentation" className="sticky top-0 bg-fd-background px-3 pt-3 pb-1 text-xs font-semibold text-fd-muted-foreground">{area(s)}</li>,
              <li key={i} role="option" aria-selected={selected}>
                <button type="button" tabIndex={selected || (!listed && n === 0) ? 0 : -1} onClick={() => pick(i)} className={`w-full px-3 py-1.5 text-left hover:bg-fd-accent ${selected ? "bg-fd-accent font-medium" : ""}`}>
                  {s.name}
                </button>
              </li>,
            ];
          })}
          {hits.length === 0 && <li className="p-3 text-fd-muted-foreground">No screen matches.</li>}
        </ul>
        {current && (() => {
          // A screen the persona may not open draws as the refusal, whether
          // reached by a tap, a switch or a link.
          const shut = current[1].name !== DENIED && deniedFor(persona.role, current[1].name);
          const record = shut ? (screenByName(DENIED)?.[1] ?? current[1]) : current[1];
          const s = asPersona(record, persona, shut ? current[1].name : (refused ?? (record.name === DENIED ? "Invoices" : undefined)));
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
                <ScreenIframe index={current[0]} title={s.name} mode="phone" persona={persona.role} preview />
              ) : (
                /* The transform makes this box the containing block for the shell's
                   fixed-position rail, so it draws here and not over the docs
                   sidebar. Keyed by screen: a drawing never inherits another's
                   filtered rows or added lines. */
                <div key={current[0]} ref={setBox} tabIndex={-1} onClickCapture={onTap} className="screen-box relative h-[80svh] overflow-auto rounded-lg border outline-none [transform:translateZ(0)]">
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
// it: a row stays when its text mentions the tab (or its singular), every row
// stays for an "all" tab or when nothing would. Only rows after the bar count,
// so a bar low on a page leaves the rows above it alone. ponytail: text
// matching stands in for data the drawings do not carry; rows tagged with
// their state would replace it.
function filterRows(tab: HTMLElement) {
  const label = tab.textContent?.trim().toLowerCase() ?? "";
  const bar = tab.closest<HTMLElement>("[data-slot=tabs]") ?? tab;
  let scope = bar.parentElement;
  while (scope && !scope.querySelector("[data-slot=item]")) scope = scope.parentElement;
  const rows = [...(scope?.querySelectorAll<HTMLElement>("[data-preview], [data-slot=item]:not([data-preview] *)") ?? [])].filter((r) => bar.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
  const words = [label, label.replace(/s$/, "")];
  const keep = label.startsWith("all") ? rows : rows.filter((r) => words.some((w) => (r.textContent ?? "").toLowerCase().includes(w)));
  for (const r of rows) r.hidden = keep.length > 0 && !keep.includes(r);
}

// A tap the resolver leaves alone still has to do something a reader can see.
// An add-a-line verb ("+ add ingredient", "Add stop") grows the list by one
// unsaved line; a commit verb in a sheet closes the sheet, and one on a page
// returns to where the reader came from, as the command would; with no trail
// to return along it flashes done. Selects, switches, steppers and links out
// are left to their own behavior. ponytail: the screens have no state, so this
// is theatre; a drawn "after" state per command would replace it.
function actInPlace(el: HTMLElement, label: string, back: () => void, canReturn: boolean) {
  if (el.matches("a, [role], [data-slot=select-trigger], [data-slot=popover-trigger], [data-slot=input-group-addon] *") || /^[−+]$/.test(label.trim())) return;
  const add = /^\+?\s*add\s+(.+)$/i.exec(label.trim());
  if (add) {
    const row = el.closest<HTMLElement>("[data-slot=item]") ?? el.parentElement?.querySelector<HTMLElement>("[data-slot=item]");
    const line = row ? (row.cloneNode(true) as HTMLElement) : document.createElement("div");
    if (!row) line.className = "rounded-lg border px-3 py-2 text-sm";
    const title = line.querySelector("[data-slot=item-title]");
    const desc = line.querySelector("[data-slot=item-description]");
    if (title) title.textContent = `New ${add[1].replace(/\s*\(.*$/, "").toLowerCase()}`;
    else line.textContent = `New ${add[1].toLowerCase()}`;
    if (desc) desc.textContent = "unsaved";
    line.querySelector("[data-slot=item-actions]")?.remove();
    line.removeAttribute("hidden");
    (row ?? el).before(line);
    return;
  }
  if (!el.matches("button") || el.matches("[data-variant=ghost], [data-row-action]")) return;
  // Outline buttons are quiet verbs; only a Save or Sync among them commits.
  if (el.matches("[data-variant=outline]") && !/^(save|sync)\b/i.test(label.trim())) return;
  if (el.closest("[data-slot=dialog-content], [data-slot=sheet-content]") || canReturn) return back();
  const was = el.textContent;
  el.textContent = "Done ✓";
  el.setAttribute("aria-disabled", "true");
  setTimeout(() => { el.textContent = was; el.removeAttribute("aria-disabled"); }, 1200);
}
