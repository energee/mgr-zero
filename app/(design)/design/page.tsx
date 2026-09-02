// app/(design)/design/page.tsx — dev-only component gallery. Every screen
// record in components/mgr/screens.tsx renders inside the real AppShell or
// PortalShell twice: a 390px and a 1280px @container frame side by side, so
// the same component's phone and desktop layouts are visible together. The
// record's `states` and reads/writes are captions under the frame. 404 outside
// development.
import { notFound } from "next/navigation";
import { AppShell, PortalShell } from "@/components/mgr/app-shell";
import { E } from "@/components/mgr/e";
import { SCREENS, type Screen } from "@/components/mgr/screens";
import { navFor, STAFF_NAV } from "@/lib/mgr/nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const WIDTHS = [390, 1280] as const;

function Frame({ s, width }: { s: Screen; width: number }) {
  const panel = s.surface === "sheet" || s.surface === "entry";
  const body = panel ? (
    <div className="flex min-h-0 flex-1 flex-col @md:justify-start @max-md:justify-end">
      <div className="flex flex-col gap-2 rounded-t-xl border bg-popover p-4 shadow-lg @md:mx-auto @md:mt-8 @md:w-full @md:max-w-md @md:rounded-xl">
        {s.hd}
        {s.body}
      </div>
    </div>
  ) : (
    s.body
  );
  const shell = s.portal ? (
    <PortalShell brand="Demo Brewing wholesale" headerRight={<span className="text-muted-foreground">Sly Fox</span>} composer={E.comp(true)} active={s.portal}>
      {body}
    </PortalShell>
  ) : (
    <AppShell
      brand="Demo Brewing"
      items={navFor(STAFF_NAV, "admin")}
      headerRight={<><Button variant="ghost" size="sm">Search</Button><Button variant="ghost" size="sm">Me</Button></>}
      composer={E.comp()}
      active={s.tab}
    >
      {body}
    </AppShell>
  );
  return (
    <div style={{ width }} className="flex h-[820px] shrink-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
      {shell}
    </div>
  );
}

export default function DesignGallery() {
  if (process.env.NODE_ENV !== "development") notFound();
  const steps = [...new Set(SCREENS.map((s) => s.step))];
  return (
    <div className="flex flex-col gap-10 p-6">
      <h1 className="text-2xl font-semibold">MGR components · {SCREENS.length} screens</h1>
      {steps.map((step) => (
        <section key={step} className="flex flex-col gap-8">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Build step {step}</h2>
          {SCREENS.filter((s) => s.step === step).map((s) => (
            <article key={s.name} className="flex flex-col gap-2">
              <div className="font-mono text-xs text-muted-foreground">
                <b className="text-primary">{s.group ?? (s.portal ? "Portal" : s.tab)}</b> · slice {s.slice} · step {s.step}
              </div>
              <h3 className="text-base font-semibold">{s.name}</h3>
              <p className="-mt-1 text-sm text-muted-foreground">{s.job}</p>
              <div className="flex gap-6 overflow-x-auto pb-2">
                {WIDTHS.map((w) => <Frame key={w} s={s} width={w} />)}
              </div>
              {s.states && E.states(s.states)}
              {s.spec && <p className={cn("font-mono text-xs text-muted-foreground")}><b className="text-warning-foreground">builder</b> · {s.spec}</p>}
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
