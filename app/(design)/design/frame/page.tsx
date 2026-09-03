// app/(design)/design/frame/page.tsx — one screen record rendered full-
// viewport inside the real shell; the gallery (../page.tsx) embeds this in
// iframes so viewport-driven parts (sidebar, sheets, safe area) behave exactly
// as shipped. Sheet screens open the real CommandForm pinned open; entry
// screens (no shell exists for them yet) get a bare centered card. Dev-only
// (../../layout.tsx gates the route group).
import { notFound } from "next/navigation";
import { AppShell, PortalShell } from "@/components/mgr/app-shell";
import { CommandForm } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { MeSheet } from "@/components/mgr/me-sheet";
import { SCREENS } from "@/components/mgr/screens";
import { Button } from "@/components/ui/button";
import { navFor, STAFF_NAV } from "@/lib/mgr/nav";

export default async function DesignFrame({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const s = SCREENS[Number((await searchParams).s)];
  if (!s) notFound();
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
  const body =
    s.surface === "sheet" ? (
      <CommandForm open title={s.name}>
        <div className="flex flex-col gap-2">{s.body}</div>
      </CommandForm>
    ) : (
      s.body
    );
  const me = <MeSheet fields={[["Brewery", "Demo Brewing"], ["Role", "admin"]]} />;
  return s.portal ? (
    <PortalShell brand="Demo Brewing wholesale" headerRight={me} composer={E.comp(true)} active={s.portal}>
      {body}
    </PortalShell>
  ) : (
    <AppShell
      brand="Demo Brewing"
      items={navFor(STAFF_NAV, "admin")}
      headerRight={<><Button variant="ghost" size="sm">Search</Button>{me}</>}
      composer={E.comp()}
      active={s.tab}
    >
      {body}
    </AppShell>
  );
}
