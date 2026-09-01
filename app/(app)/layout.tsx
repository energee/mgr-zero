import { getActiveBrewery } from "@/lib/brewery";
import { BreweryProvider } from "./brewery-provider";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const brewery = await getActiveBrewery();
  return (
    <BreweryProvider id={brewery.id}>
      <div className="flex min-h-screen">
        <aside className="w-52 border-r p-4">
          <div className="mb-6 font-semibold">{brewery.name}</div>
          <nav className="flex flex-col gap-2 text-sm">
            <Link href="/">Dashboard</Link>
            <Link href="/inventory">Inventory</Link>
            <Link href="/catalog">Catalog</Link>
            <Link href="/customers">Customers</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/orders">Orders</Link>
            <Link href="/pick">Pick</Link>
            <Link href="/invoices">Invoices</Link>
            <Link href="/replenishment">Replenishment</Link>
            <Link href="/settings/import">Import</Link>
            <Link href="/settings/team">Team</Link>
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </BreweryProvider>
  );
}
