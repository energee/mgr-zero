// components/mgr/screen-index.tsx — the screen inventory as documentation.
// Renders components/mgr/screens.tsx (the source of truth) as prose, so the
// published page cannot drift from the gallery and nothing here is maintained
// by hand. The frames themselves stay at /design, which is dev-only; this page
// carries what a reader needs without a running server: what each screen is
// for, what it reads and writes, and which states it must handle.
import { SCREENS, type Screen } from "@/components/mgr/screens";

const area = (s: Screen) => s.group ?? (s.portal ? "Portal" : (s.tab ?? "Other"));

// Order areas by where they appear in the inventory, so the page reads in the
// same build order the gallery does rather than alphabetically.
function byArea() {
  const groups = new Map<string, Screen[]>();
  for (const s of SCREENS) {
    const key = area(s);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return [...groups];
}

export function ScreenIndex() {
  return (
    <div className="flex flex-col gap-8">
      {byArea().map(([name, screens]) => (
        <section key={name} className="flex flex-col gap-4">
          <h2 id={name.toLowerCase()} className="scroll-m-20 text-xl font-semibold">
            {name} <span className="text-sm font-normal text-fd-muted-foreground">· {screens.length} screens</span>
          </h2>
          {screens.map((s) => (
            <article key={s.name} className="rounded-lg border p-4">
              <h3 className="text-base font-medium">{s.name}</h3>
              <p className="mt-1 text-sm text-fd-muted-foreground">{s.job}</p>
              <dl className="mt-3 grid gap-1 font-mono text-xs text-fd-muted-foreground">
                <div><dt className="inline font-semibold">reads </dt><dd className="inline">{s.reads}</dd></div>
                <div><dt className="inline font-semibold">writes </dt><dd className="inline">{s.writes}</dd></div>
                <div><dt className="inline font-semibold">where </dt><dd className="inline">slice {s.slice} · step {s.step}{s.surface ? ` · ${s.surface}` : ""}</dd></div>
              </dl>
              {s.states && (
                <ul className="mt-3 flex flex-col gap-1 text-sm">
                  {s.states.map(([state, note], i) => (
                    <li key={i}><b className="font-medium">{state}</b> — {note}</li>
                  ))}
                </ul>
              )}
              {s.spec && <p className="mt-3 text-sm">{s.spec}</p>}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
