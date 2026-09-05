// app/(app)/layout.tsx — staff chrome: the shared AppShell fed the
// staff manifest (lib/mgr/nav.ts) with planned areas and the role's hidden
// entries removed, and a Me sheet with the
// brewery, role and sign-out; the rail's collapsed state round-trips through
// the sidebar_state cookie shadcn's Sidebar writes (lib/mgr/sidebar-state.ts).
// Pages render inside the shell's main column.
import { getActiveBrewery } from "@/lib/brewery";
import { sidebarOpenFromCookie } from "@/lib/mgr/sidebar-state";
import { BreweryProvider } from "./brewery-provider";
import { AppShell } from "@/components/mgr/app-shell";
import { MeSheet } from "@/components/mgr/me-sheet";
import { navFor, shippedNav, STAFF_NAV } from "@/lib/mgr/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [brewery, sidebarOpen] = await Promise.all([getActiveBrewery(), sidebarOpenFromCookie()]);
  return (
    <BreweryProvider id={brewery.id}>
      <AppShell
        brand={brewery.name}
        items={navFor(shippedNav(STAFF_NAV), brewery.role)}
        sidebarOpen={sidebarOpen}
        headerRight={
          <MeSheet fields={[["Brewery", brewery.name], ["Role", brewery.role]]} />
        }
      >
        {children}
      </AppShell>
    </BreweryProvider>
  );
}
