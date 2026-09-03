// app/(portal)/layout.tsx — chrome for the customer portal: the same
// AppShell as staff, fed the buyer-facing portal manifest (Order · Orders ·
// Invoices) and the customer's account name. Resolves the caller's customer
// account instead of a brewery membership and provides breweryId via the same
// BreweryProvider so lib/commands/client.ts's command() works unmodified. The
// rail's collapsed state round-trips through the sidebar_state cookie exactly
// as in the staff layout.
import { getActiveCustomer } from "@/lib/portal";
import { sidebarOpenFromCookie } from "@/lib/mgr/sidebar-state";
import { BreweryProvider } from "@/app/(app)/brewery-provider";
import { PortalShell } from "@/components/mgr/app-shell";
import { MeSheet } from "@/components/mgr/me-sheet";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [customer, sidebarOpen] = await Promise.all([getActiveCustomer(), sidebarOpenFromCookie()]);
  return (
    <BreweryProvider id={customer.breweryId}>
      <PortalShell
        brand={customer.customerName}
        sidebarOpen={sidebarOpen}
        headerRight={
          <MeSheet fields={[["Account", customer.customerName]]} />
        }
      >
        {children}
      </PortalShell>
    </BreweryProvider>
  );
}
