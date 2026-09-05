// lib/mgr/screen-explorer.ts — the pure half of the screen explorer
// (content/docs/screens-explore.mdx): which inventory records match a text
// query, an area and a surface. Kept out of the component so it is testable
// without a DOM. Venue frames are never listed: they belong to /docs/integrations.
import { area, SCREENS, type Screen } from "@/components/mgr/screens";

export type Surface = NonNullable<Screen["surface"]>;
export type Filter = { q?: string; area?: string; surface?: Surface };

/** An MGR screen with its inventory index, which keys the frame route. */
export type Indexed = [index: number, screen: Screen];

const MGR: Indexed[] = SCREENS.map((s, i): Indexed => [i, s]).filter(([, s]) => !s.venue);
const BY_NAME = new Map(MGR.map((x) => [x[1].name, x]));
const BY_INDEX = new Map(MGR.map((x) => [x[0], x]));

/** The areas MGR screens file under, in inventory order. */
export const AREAS = [...new Set(MGR.map(([, s]) => area(s)))];

/** What the search box reads: the name, then the job line, spec and state
 * notes where they are plain strings (a JSX job is only findable by name). */
export const haystack = (s: Screen) =>
  [s.name, s.job, s.spec, ...(s.states ?? []).flat()].filter((x) => typeof x === "string").join(" ").toLowerCase();

export function filterScreens({ q = "", area: a, surface }: Filter): Indexed[] {
  const needle = q.trim().toLowerCase();
  return MGR.filter(
    ([, s]) =>
      (!a || area(s) === a) &&
      // A page has no `surface`; the chip reads better than "undefined".
      (!surface || (s.surface ?? "page") === surface) &&
      (!needle || haystack(s).includes(needle)),
  );
}

/** Everything the explorer keeps in the URL hash so a link reopens the same
 * view: `s` the inventory index, `p` the persona role, `q`/`a`/`f` the
 * search, area and surface filters. `#s<index>` is the form the first links used. */
export type HashState = { s?: number; p?: string; q?: string; a?: string; f?: string; w?: string };
const KEYS = ["p", "q", "a", "f", "w"] as const;

export function parseHash(hash: string): HashState {
  const legacy = /^#s(\d+)$/.exec(hash);
  if (legacy) return { s: Number(legacy[1]) };
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const out: HashState = {};
  if (params.has("s")) out.s = Number(params.get("s"));
  for (const k of KEYS) if (params.get(k)) out[k] = params.get(k)!;
  return out;
}

export function buildHash(state: HashState): string {
  const params = new URLSearchParams();
  if (state.s !== undefined) params.set("s", String(state.s));
  for (const k of KEYS) if (state[k]) params.set(k, state[k]!);
  return `#${params}`;
}

/** Both lookups return the one tuple per screen, so a hook dependency on it is stable. */
export const screenByName = (name: string) => BY_NAME.get(name);
export const screenByIndex = (i?: number) => (i === undefined ? undefined : BY_INDEX.get(i));

const isPage = (i: number) => SCREENS[i].surface === undefined;

// Sheets whose area's first page is not the one they open from.
const OVER: Record<string, string> = {
  "Square locations": "Point of sale", "Square → QuickBooks connector": "Point of sale", "Disconnect Square": "Point of sale",
  "POS item": "Menu", "Disconnect Slack": "Chat settings", "Question invoice": "Pay invoice", "Review order": "Shop", "Portal Me": "Shop",
};

/** The page a sheet (or entry) at `index` draws over: the last page in the
 * visited `trail`, else the page named in OVER, else the first page in its own
 * area. A page is its own ground. Global is anywhere, not a place: its sheets
 * (Search, Me, Record movement) open over Today, never over the refusal or
 * composer pages filed beside them. */
export function pageUnder(trail: number[], index: number): number {
  if (isPage(index)) return index;
  for (let n = trail.length - 1; n >= 0; n--) if (isPage(trail[n])) return trail[n];
  const over = OVER[SCREENS[index].name];
  if (over) { const hit = screenByName(over); if (hit) return hit[0]; }
  const own = area(SCREENS[index]);
  if (own === "Global") return MGR[0][0];
  return MGR.find(([i, s]) => isPage(i) && area(s) === own)?.[0] ?? MGR[0][0];
}

/** A history entry owns its walk; revisiting a screen cuts the loop. */
export function advanceWalk(walk: number[], current: number | undefined, next: number, fresh = false): number[] {
  const trail = fresh ? [] : walk.length ? walk : current === undefined ? [] : [current];
  const seen = trail.indexOf(next);
  return [...(seen < 0 ? trail : trail.slice(0, seen)), next];
}
