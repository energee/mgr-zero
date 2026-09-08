// app/(app)/layout.tsx — staff chrome: the shared AppShell fed the
// staff manifest (lib/mgr/nav.ts) with planned areas and the role's hidden
// entries removed, and a Me sheet with the
// brewery, role and sign-out, and the header Search control (/search); the rail's collapsed state round-trips through
// the sidebar_state cookie shadcn's Sidebar writes (lib/mgr/sidebar-state.ts).
// Pages render inside the shell's main column.
import { getActiveBrewery } from "@/lib/brewery";
import { getRequestIdentity, getStaffMemberships } from "@/lib/auth/request-context";
import { sidebarOpenFromCookie } from "@/lib/mgr/sidebar-state";
import { BreweryProvider } from "./brewery-provider";
import { AppShell } from "@/components/mgr/app-shell";
import { MeSheet } from "@/components/mgr/me-sheet";
import { navFor, shippedNav, STAFF_NAV } from "@/lib/mgr/nav";
import Link from "next/link";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/mgr/icon";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [brewery, sidebarOpen, identity, memberships] = await Promise.all([getActiveBrewery(), sidebarOpenFromCookie(), getRequestIdentity(), getStaffMemberships()]);
  return (
    <BreweryProvider id={brewery.id}>
      <AppShell
        brand={brewery.name}
        items={navFor(shippedNav(STAFF_NAV), brewery.role)}
        sidebarOpen={sidebarOpen}
        headerRight={
          <>
            <Button variant="ghost" size="sm" asChild><Link href="/search" aria-label="Search"><Icon icon={Search01Icon} />Search</Link></Button>
            <MeSheet fields={[["Signed in as", identity?.email ?? ""], ["Brewery", brewery.name], ["Role", brewery.role]]}
              breweries={memberships.map((m) => ({ id: m.breweryId, name: m.breweryName, current: m.breweryId === brewery.id }))} />
          </>
        }
      >
        {children}
      </AppShell>
    </BreweryProvider>
  );
}
