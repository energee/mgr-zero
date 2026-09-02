// app/(design)/design/page.tsx — dev-only component gallery. Every screen
// record in components/mgr/screens.tsx is embedded twice from ./frame as a
// real viewport (390px phone, 1280px desktop) side by side, so the same
// component's phone and desktop layouts are visible together. The record's
// states, spec and reads/writes caption the frame. Frames are lazy-loaded
// (154 dev-mode pages otherwise load at once) and an anchor index jumps to
// any screen. 404 outside development.
import { notFound } from "next/navigation";
import { E } from "@/components/mgr/e";
import { SCREENS } from "@/components/mgr/screens";

const WIDTHS = [390, 1280] as const;

export default function DesignGallery() {
  if (process.env.NODE_ENV !== "development") notFound();
  const steps = [...new Set(SCREENS.map((s) => s.step))];
  return (
    <div className="flex flex-col gap-10 p-6">
      <h1 className="text-2xl font-semibold">MGR components · {SCREENS.length} screens</h1>
      <nav aria-label="Screens" className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {SCREENS.map((s, i) => (
          <a key={i} href={`#s${i}`} className="text-muted-foreground hover:text-foreground">{s.name}</a>
        ))}
      </nav>
      {steps.map((step) => (
        <section key={step} className="flex flex-col gap-8">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Build step {step}</h2>
          {SCREENS.map((s, i) => s.step === step && (
            <article key={s.name} id={`s${i}`} className="flex scroll-mt-4 flex-col gap-2">
              <div className="font-mono text-xs text-muted-foreground">
                <b className="text-primary">{s.group ?? (s.portal ? "Portal" : s.tab)}</b> · slice {s.slice} · step {s.step}
              </div>
              <h3 className="text-base font-semibold">{s.name}</h3>
              <p className="-mt-1 text-sm text-muted-foreground">{s.job}</p>
              <div className="flex gap-6 overflow-x-auto pb-2">
                {WIDTHS.map((w) => (
                  <iframe key={w} src={`/design/frame?s=${i}`} title={`${s.name} at ${w}px`} width={w} height={820} loading="lazy" className="shrink-0 rounded-lg border bg-background" />
                ))}
              </div>
              {s.states && E.states(s.states)}
              {s.spec && <p className="font-mono text-xs text-muted-foreground"><b className="text-warning-foreground">builder</b> · {s.spec}</p>}
              <p className="border-t pt-1 font-mono text-xs text-muted-foreground">
                reads <span className="text-foreground">{s.reads}</span><br />writes <span className="text-foreground">{s.writes}</span>
              </p>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
