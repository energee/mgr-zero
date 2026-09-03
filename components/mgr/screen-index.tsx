// components/mgr/screen-index.tsx — the screen inventory as documentation.
// Renders components/mgr/screens.tsx (the source of truth) as prose, so the
// published page cannot drift from the gallery and nothing here is maintained
// by hand. The frames themselves stay at /design, which is dev-only; this page
// carries what a reader needs without a running server: the drawing itself,
// what each screen is for, what it reads and writes, and which states it must
// handle. Bodies render inline rather than in the gallery's iframes — the
// frames are embedded from app/(frames)/screens/frame, which ships (unlike the
// dev-only /design), so each renders in the real shell at a real viewport width:
// the desktop rail and the phone tab bar switch on viewport breakpoints, and an
// inline render in a narrow box would show the desktop layout at every size.
import type { TOCItemType } from "fumadocs-core/toc";
import { area, SCREENS, type Screen } from "@/components/mgr/screens";
import { VENUE_MARKS } from "@/components/mgr/brand-icons";
import { Icon } from "@/components/mgr/icon";
import { ScreenEmbed, ScreenWidth } from "@/components/mgr/screen-width";


const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
// Areas and screens share names — a "Today" area holds a "Today" screen — so
// screen anchors are prefixed; without it both headings claim #today and the
// sub-index sends every screen link to its area.
const screenSlug = (name: string) => `screen-${slug(name)}`;

// Order sections by where they appear in the inventory, so a page reads in the
// same build order the gallery does rather than alphabetically. MGR screens
// group by the area that owns them; venue frames group by the product they are
// drawn inside, which is the only grouping that means anything for them. Each
// screen keeps its inventory index, which is what the frame route is keyed by.
type Kind = "mgr" | "venues";
function sections(kind: Kind) {
  const groups = new Map<string, [number, Screen][]>();
  SCREENS.forEach((s, i) => {
    if ((kind === "venues") !== Boolean(s.venue)) return;
    const key = area(s);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push([i, s]);
  });
  return [...groups];
}
const INDEX = { mgr: sections("mgr"), venues: sections("venues") };

/** A page's own table of contents: Fumadocs builds one from an MDX file's
 * headings, and these headings come from this component instead, so the docs
 * route hands the matching list to DocsPage for the right-hand sub-index. */
const tocFor = (kind: Kind): TOCItemType[] =>
  INDEX[kind].flatMap(([name, screens]) => [
    { title: name, url: `#${slug(name)}`, depth: 2 },
    ...screens.map(([, s]) => ({ title: s.name, url: `#${screenSlug(s.name)}`, depth: 3 })),
  ]);
export const SCREEN_TOC = tocFor("mgr");
export const VENUE_TOC = tocFor("venues");

export function ScreenIndex({ kind = "mgr" }: { kind?: Kind }) {
  return (
    <ScreenWidth deskOnly={kind === "venues"}>
      {INDEX[kind].map(([name, screens]) => (
        <section key={name} className="flex flex-col gap-8">
          <h2 id={slug(name)} className="flex items-center gap-2 scroll-m-20 border-b pb-2 text-xl font-semibold">
            {name in VENUE_MARKS && <Icon icon={VENUE_MARKS[name as keyof typeof VENUE_MARKS]} size={20} />}
            {name} <span className="text-sm font-normal text-fd-muted-foreground">· {screens.length} screens</span>
          </h2>
          {screens.map(([index, s]) => (
            <article key={s.name}>
              <h3 id={screenSlug(s.name)} className="scroll-m-20 text-base font-medium">{s.name}</h3>
              <p className="mt-1 text-sm text-fd-muted-foreground">{s.job}</p>
              {s.states && (
                <ul className="mt-3 flex flex-col gap-1 text-sm">
                  {s.states.map(([state, note], i) => (
                    <li key={i}><b className="font-medium">{state}</b>: {note}</li>
                  ))}
                </ul>
              )}
              {/* A redrawn screen carries the reasoning for the change; readers
                  who want the screen, not its history, get it folded. */}
              {s.spec && (s.redrawn ? (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-fd-muted-foreground">Why this was redrawn</summary>
                  <p className="mt-2">{s.spec}</p>
                </details>
              ) : <p className="mt-3 text-sm">{s.spec}</p>)}
              <details className="mt-3 text-xs text-fd-muted-foreground">
                <summary className="cursor-pointer">Reads and writes</summary>
                <dl className="mt-2 grid gap-1 font-mono">
                  <div><dt className="inline font-semibold">reads </dt><dd className="inline">{s.reads}</dd></div>
                  <div><dt className="inline font-semibold">writes </dt><dd className="inline">{s.writes}</dd></div>
                  <div><dt className="inline font-semibold">where </dt><dd className="inline">slice {s.slice} · step {s.step}{s.surface ? ` · ${s.surface}` : ""}</dd></div>
                </dl>
              </details>
              <div className="mt-4 overflow-x-auto">
                <ScreenEmbed index={index} title={s.name} />
              </div>
            </article>
          ))}
        </section>
      ))}
    </ScreenWidth>
  );
}
