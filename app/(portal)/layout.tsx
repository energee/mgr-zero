// app/(portal)/layout.tsx — chrome for the customer portal: account name,
// nav (Shop/Orders/Invoices), sign out. Mirrors app/(app)/layout.tsx but
// resolves the caller's customer account instead of a brewery membership,
// and provides breweryId to portal client components via the same
// BreweryProvider so lib/commands/client.ts's command() works unmodified.
import { getActiveCustomer } from "@/lib/portal";
import { BreweryProvider } from "@/app/(app)/brewery-provider";
import { logout } from "@/app/(auth)/actions";
import Link from "next/link";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const customer = await getActiveCustomer();
  return (
    <BreweryProvider id={customer.breweryId}>
      <div className="flex min-h-screen">
        <aside className="w-52 border-r p-4">
          <div className="mb-6 font-semibold">{customer.customerName}</div>
          <nav className="flex flex-col gap-2 text-sm">
            <Link href="/portal">Shop</Link>
            <Link href="/portal/orders">Orders</Link>
            <Link href="/portal/invoices">Invoices</Link>
          </nav>
          <form action={logout} className="mt-6">
            <button type="submit" className="text-sm text-muted-foreground underline underline-offset-2">
              Sign out
            </button>
          </form>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </BreweryProvider>
  );
}
