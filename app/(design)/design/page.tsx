// app/(design)/design/page.tsx — dev-only component gallery. Every screen
// record in components/mgr/screens.tsx is embedded from ./frame as a real
// viewport, so viewport-driven parts (sidebar, sheets, safe area) behave as
// shipped; gallery.tsx owns the phone/desk width switch and lazy frames. The
// record's states, spec and reads/writes caption the frame. Dev-only
// (../layout.tsx gates the route group).
import { E } from "@/components/mgr/e";
import { SCREENS } from "@/components/mgr/screens";
import { Gallery } from "./gallery";

export default function DesignGallery() {
  const frames = SCREENS.map((s) => ({
    name: s.name,
    caption: (
      <>
        <div className="font-mono text-xs text-muted-foreground">
          <b className="text-primary">{s.group ?? (s.portal ? "Portal" : s.tab)}</b> · slice {s.slice} · step {s.step}
        </div>
        <h3 className="text-base font-semibold">{s.name}</h3>
        <p className="-mt-1 text-sm text-muted-foreground">{s.job}</p>
        {s.states && E.states(s.states)}
        {s.spec && <p className="font-mono text-xs text-muted-foreground"><b className="text-warning-foreground">builder</b> · {s.spec}</p>}
        <p className="font-mono text-xs text-muted-foreground">
          reads <span className="text-foreground">{s.reads}</span><br />writes <span className="text-foreground">{s.writes}</span>
        </p>
      </>
    ),
  }));
  return (
    <div className="flex flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold">MGR components · {SCREENS.length} screens</h1>
      <nav aria-label="Screens" className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {SCREENS.map((s, i) => (
          <a key={i} href={`#s${i}`} className="text-muted-foreground hover:text-foreground">{s.name}</a>
        ))}
      </nav>
      <Gallery frames={frames} />
    </div>
  );
}
