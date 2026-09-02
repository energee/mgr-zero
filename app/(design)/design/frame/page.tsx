// app/(design)/design/frame/page.tsx — one screen record rendered full-
// viewport inside the real shell; the gallery (../page.tsx) embeds this in
// iframes at phone and desktop widths so viewport-driven parts (sidebar,
// sheets, safe area) behave exactly as shipped. Dev-only, like the gallery.
import { notFound } from "next/navigation";
import { AppShell, PortalShell } from "@/components/mgr/app-shell";
import { E } from "@/components/mgr/e";
import { SCREENS } from "@/components/mgr/screens";
import { Button } from "@/components/ui/button";
import { navFor, STAFF_NAV } from "@/lib/mgr/nav";

export default async function DesignFrame({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const s = SCREENS[Number((await searchParams).s)];
  if (!s) notFound();
  const panel = s.surface === "sheet";
  const body = panel ? (
    <div className="flex min-h-0 flex-1 flex-col justify-end md:justify-start">
      <div className="flex flex-col gap-2 rounded-t-xl border bg-popover p-4 shadow-lg md:mx-auto md:mt-8 md:w-full md:max-w-md md:rounded-xl">
        {s.hd}
        {s.body}
      </div>
    </div>
  ) : (
    s.body
  );
  if (s.surface === "entry") {
    return (
      <div className="flex min-h-svh flex-col justify-end bg-background p-4 md:items-center md:justify-center">
        <div className="flex w-full flex-col gap-2 rounded-xl border bg-card p-6 md:max-w-sm">
          {s.hd}
          {s.body}
        </div>
      </div>
    );
  }
  return s.portal ? (
    <PortalShell brand="Demo Brewing wholesale" headerRight={<Button variant="ghost" size="sm">Me</Button>} composer={E.comp(true)} active={s.portal}>
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
}
