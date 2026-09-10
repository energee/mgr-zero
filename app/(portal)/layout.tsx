// app/(portal)/layout.tsx — chrome for the customer portal: the same
// AppShell as staff, fed the buyer-facing portal manifest (Order · Orders ·
// Invoices · Account) and the customer's account name. Resolves the caller's customer
// account instead of a brewery membership and provides breweryId via the same
// BreweryProvider so lib/commands/client.ts's command() works unmodified. The
// rail's collapsed state round-trips through the sidebar_state cookie exactly
// as in the staff layout.
import { getActiveCustomer } from "@/lib/portal";
import { getRequestIdentity } from "@/lib/auth/request-context";
import { sidebarOpenFromCookie } from "@/lib/mgr/sidebar-state";
import { BreweryProvider } from "@/app/(app)/brewery-provider";
import { PortalShell } from "@/components/mgr/app-shell";
import { MeSheet, MeSheetActions } from "@/components/mgr/me-sheet";
import { PortalMeView } from "@/components/mgr/views/portal-me";
import { toPortalMeViewProps } from "@/lib/mgr/portal-me-view";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [customer, sidebarOpen, identity] = await Promise.all([getActiveCustomer(), sidebarOpenFromCookie(), getRequestIdentity()]);
  return (
    <BreweryProvider id={customer.breweryId} actorId={identity!.userId} customerId={customer.customerId}>
      <PortalShell
        brand={customer.customerName}
        sidebarOpen={sidebarOpen}
        headerRight={
          <MeSheet
            content={
              <PortalMeView
                model={toPortalMeViewProps({ email: identity?.email ?? "", account: customer.customerName })}
                footer={<MeSheetActions signOut="outline" />}
              />
            }
          />
        }
      >
        {children}
      </PortalShell>
    </BreweryProvider>
  );
}
