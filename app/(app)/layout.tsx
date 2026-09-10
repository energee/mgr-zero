// app/(app)/layout.tsx — staff chrome: the shared AppShell fed the
// staff manifest (lib/mgr/nav.ts) with planned areas and the role's hidden
// entries removed, and a Me sheet with the
// brewery, role and sign-out, and the header Search sheet; the rail's collapsed state round-trips through
// the sidebar_state cookie shadcn's Sidebar writes (lib/mgr/sidebar-state.ts).
// Pages render inside the shell's main column.
import { getActiveBrewery } from "@/lib/brewery";
import { getRequestIdentity, getStaffMemberships } from "@/lib/auth/request-context";
import { sidebarOpenFromCookie } from "@/lib/mgr/sidebar-state";
import { BreweryProvider } from "./brewery-provider";
import { AppShell } from "@/components/mgr/app-shell";
import { MeSheet, MeSheetActions } from "@/components/mgr/me-sheet";
import { MeView } from "@/components/mgr/views/me";
import { navFor, shippedNav, STAFF_NAV } from "@/lib/mgr/nav";
import { SearchCacheProvider, SearchSheet } from "@/components/mgr/search-palette";
import { switchBrewery } from "@/app/(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [brewery, sidebarOpen, identity, memberships] = await Promise.all([getActiveBrewery(), sidebarOpenFromCookie(), getRequestIdentity(), getStaffMemberships()]);
  return (
    <SearchCacheProvider key={`${identity?.userId}:${brewery.id}:${brewery.role}`}>
      <BreweryProvider id={brewery.id} actorId={identity!.userId}>
        <AppShell
          brand={brewery.name}
          items={navFor(shippedNav(STAFF_NAV), brewery.role)}
          sidebarOpen={sidebarOpen}
          headerRight={
            <>
              {brewery.role !== "taproom" && <SearchSheet />}
              <MeSheet>
                <MeView
                  model={{
                    role: brewery.role,
                    email: identity?.email ?? "",
                    breweries: memberships.map((m) => ({ id: m.breweryId, name: m.breweryName, current: m.breweryId === brewery.id })),
                  }}
                  switchAction={switchBrewery}
                  footer={<MeSheetActions />}
                />
              </MeSheet>
            </>
          }
        >
          {children}
        </AppShell>
      </BreweryProvider>
    </SearchCacheProvider>
  );
}
