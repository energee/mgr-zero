// app/(app)/layout.tsx — staff chrome: the shared AppShell fed the
// role-filtered staff manifest (lib/mgr/nav.ts) and a Me sheet with the
// brewery, role and sign-out. Pages render inside the shell's main column.
import { getActiveBrewery } from "@/lib/brewery";
import { BreweryProvider } from "./brewery-provider";
import { AppShell } from "@/components/mgr/app-shell";
import { MeSheet } from "@/components/mgr/me-sheet";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/(auth)/actions";
import { navFor, STAFF_NAV } from "@/lib/mgr/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const brewery = await getActiveBrewery();
  return (
    <BreweryProvider id={brewery.id}>
      <AppShell
        brand={brewery.name}
        items={navFor(STAFF_NAV, brewery.role)}
        headerRight={
          <MeSheet fields={[["Brewery", brewery.name], ["Role", brewery.role]]}>
            <form action={logout} className="mt-auto">
              <Button type="submit" variant="outline" className="min-h-12 w-full">Sign out</Button>
            </form>
          </MeSheet>
        }
      >
        {children}
      </AppShell>
    </BreweryProvider>
  );
}
