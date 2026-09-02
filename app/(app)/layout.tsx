// app/(app)/layout.tsx — staff chrome: the shared AppShell fed the
// role-filtered staff manifest (lib/mgr/nav.ts) and a Me sheet with the
// brewery, role and sign-out; the rail's collapsed state round-trips through
// the sidebar_state cookie shadcn's Sidebar writes. Pages render inside the
// shell's main column.
import { cookies } from "next/headers";
import { getActiveBrewery } from "@/lib/brewery";
import { BreweryProvider } from "./brewery-provider";
import { AppShell } from "@/components/mgr/app-shell";
import { MeSheet } from "@/components/mgr/me-sheet";
import { navFor, STAFF_NAV } from "@/lib/mgr/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const brewery = await getActiveBrewery();
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <BreweryProvider id={brewery.id}>
      <AppShell
        brand={brewery.name}
        items={navFor(STAFF_NAV, brewery.role)}
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
