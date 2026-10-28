import { CommandRecovery } from "@/components/mgr/command-recovery";
// app/(app)/layout.tsx — staff chrome: the shared AppShell fed the
// staff manifest (lib/mgr/nav.ts) with planned areas and the role's hidden
// entries removed, and a Me sheet with the
// brewery, role, Chat, your gravity unit and sign-out, and the header Search sheet; the rail's collapsed state round-trips through
// the sidebar_state cookie shadcn's Sidebar writes (lib/mgr/sidebar-state.ts).
// Pages render inside the shell's main column.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { optionalPageQuery } from "@/lib/mgr/page-query";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { GravityUnitForm } from "./settings/gravity-unit-form";
import "@/lib/commands/all";
import { getRequestIdentity, getStaffMemberships } from "@/lib/auth/request-context";
import { sidebarOpenFromCookie } from "@/lib/mgr/sidebar-state";
import { BreweryProvider } from "@/lib/brewery-provider";
import { AppShell } from "@/components/mgr/app-shell";
import { MeSheet, MeSheetActions } from "@/components/mgr/me-sheet";
import { MeView } from "@/components/mgr/views/me";
import { navFor, shippedNav, STAFF_NAV } from "@/lib/mgr/nav";
import { SearchCacheProvider, SearchSheet } from "@/components/mgr/search-palette";
import { switchBrewery } from "@/app/(auth)/actions";
import { Composer } from "@/components/mgr/composer";
import { CommandQueryProvider } from "@/components/mgr/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { onlyRoles } from "@/lib/mgr/roles";
import { isChatConfigured } from "@/lib/env/server-parser";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [brewery, sidebarOpen, identity, memberships] = await Promise.all([getActiveBrewery(), sidebarOpenFromCookie(), getRequestIdentity(), getStaffMemberships()]);
  const roleScope = brewery.roles.toSorted().join(",");
  // The Me sheet's gravity unit is an enrichment: a failed read leaves the sheet without it, not the app without a shell.
  const units = await optionalPageQuery<{ brewery: GravityUnit; mine: GravityUnit | null }>("get_gravity_unit", {}, await buildContext(brewery.id));
  return (
    <SearchCacheProvider key={`${identity?.userId}:${brewery.id}:${roleScope}`}>
      <BreweryProvider id={brewery.id} actorId={identity!.userId}>
        <CommandQueryProvider key={`${identity!.userId}:${brewery.id}:${roleScope}`} scope={{ actorId: identity!.userId, breweryId: brewery.id, roles: brewery.roles }}>
        <AppShell
          brand={brewery.name}
          items={navFor(shippedNav(STAFF_NAV), brewery.roles)}
          sidebarOpen={sidebarOpen}
          composer={<Composer key={`${identity!.userId}:${brewery.id}:${roleScope}`} roles={brewery.roles} chatConfigured={isChatConfigured()} />}
          headerRight={
            <>
              {!onlyRoles(brewery.roles, ["taproom"]) && <SearchSheet roles={brewery.roles} />}
              <MeSheet>
                <MeView
                  model={{
                    roles: brewery.roles,
                    email: identity?.email ?? "",
                    breweries: memberships.map((m) => ({ id: m.breweryId, name: m.breweryName, current: m.breweryId === brewery.id })),
                  }}
                  switchAction={switchBrewery}
                  chatHref="/settings/chat"
                  units={units ? <GravityUnitForm part="mine" brewery={units.brewery} mine={units.mine} /> : null}
                  footer={<MeSheetActions guide="/docs/staff-guide" />}
                />
              </MeSheet>
            </>
          }
        >
          <CommandRecovery />
          {children}
        </AppShell>
        <Toaster />
        </CommandQueryProvider>
      </BreweryProvider>
    </SearchCacheProvider>
  );
}
