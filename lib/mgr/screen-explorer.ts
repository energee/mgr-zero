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

/** The areas MGR screens file under, in inventory order. */
export const AREAS = [...new Set(MGR.map(([, s]) => area(s)))];

export function filterScreens({ q = "", area: a, surface }: Filter): Indexed[] {
  const needle = q.trim().toLowerCase();
  return MGR.filter(
    ([, s]) =>
      (!a || area(s) === a) &&
      // A page has no `surface`; the chip reads better than "undefined".
      (!surface || (s.surface ?? "page") === surface) &&
      (!needle || s.name.toLowerCase().includes(needle)),
  );
}

export const screenByName = (name: string) => MGR.find(([, s]) => s.name === name);

const isPage = (i: number) => SCREENS[i].surface === undefined;

/** The page a sheet (or entry) at `index` draws over: the last page in the
 * visited `trail`, else the first page in its own area. A page is its own ground. */
export function pageUnder(trail: number[], index: number): number {
  if (isPage(index)) return index;
  for (let n = trail.length - 1; n >= 0; n--) if (isPage(trail[n])) return trail[n];
  const own = area(SCREENS[index]);
  return MGR.find(([i, s]) => isPage(i) && area(s) === own)?.[0] ?? MGR[0][0];
}
