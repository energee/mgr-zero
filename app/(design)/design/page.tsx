// app/(design)/design/page.tsx — dev-only component gallery. Every screen
// record in components/mgr/screens.tsx is embedded from /screens/frame as a
// real viewport, so viewport-driven parts (sidebar, sheets, safe area) behave
// as shipped; components/mgr/screen-width.tsx owns the width switch and lazy
// frames, shared with the published inventory. The record's states, spec and
// reads/writes caption the frame. Dev-only (../layout.tsx gates the route group).
import { E } from "@/components/mgr/e";
import { area, SCREENS } from "@/components/mgr/screens";
import { ScreenEmbed, ScreenWidth } from "@/components/mgr/screen-width";

export default function DesignGallery() {
  return (
    <div className="flex flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold">MGR components · {SCREENS.length} screens</h1>
      <nav aria-label="Screens" className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {SCREENS.map((s, i) => (
          <a key={i} href={`#s${i}`} className="text-muted-foreground hover:text-foreground">{s.name}</a>
        ))}
      </nav>
      <ScreenWidth>
        {SCREENS.map((s, i) => (
          <article key={s.name} id={`s${i}`} className="flex scroll-mt-4 flex-col gap-2">
            <div className="font-mono text-xs text-muted-foreground">
              <b className="text-primary">{area(s)}</b> · slice {s.slice} · step {s.step}
            </div>
            <h3 className="text-base font-semibold">{s.name}</h3>
            <p className="-mt-1 text-sm text-muted-foreground">{s.job}</p>
            {s.states && E.states(s.states)}
            {s.spec && <p className="font-mono text-xs text-muted-foreground"><b className="text-warning-foreground">builder</b> · {s.spec}</p>}
            <p className="font-mono text-xs text-muted-foreground">
              reads <span className="text-foreground">{s.reads}</span><br />writes <span className="text-foreground">{s.writes}</span>
            </p>
            <ScreenEmbed index={i} title={s.name} />
          </article>
        ))}
      </ScreenWidth>
    </div>
  );
}
