// app/(app)/customers/page.tsx — customers list. Reads through the command
// registry (list_customers, list_price_lists) with a brewery-scoped Ctx.
// Failures throw to the (app) error boundary.
import Link from "next/link";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { CustomerForm } from "./customer-form";

type PriceList = { id: string; name: string };
type Customer = {
  id: string;
  name: string;
  type: string;
  state: string;
  license_no: string | null;
  payment_terms: string;
  price_lists: { name: string } | null;
};

export default async function CustomersPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [customers, priceLists] = (await Promise.all([
    runCommand("list_customers", {}, ctx),
    runCommand("list_price_lists", {}, ctx),
  ])) as [Customer[], PriceList[]];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Customers</h1>
        <CustomerForm priceLists={priceLists.map((p) => ({ id: p.id, name: p.name }))} />
      </div>

      {customers.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">Name</th>
              <th className="py-1 font-normal">Type</th>
              <th className="py-1 font-normal">State</th>
              <th className="py-1 font-normal">Price list</th>
              <th className="py-1 font-normal">Terms</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-1">
                  <Link href={`/customers/${c.id}`} className="underline underline-offset-2">
                    {c.name}
                  </Link>
                </td>
                <td className="py-1">{c.type}</td>
                <td className="py-1">{c.state}</td>
                <td className="py-1">{c.price_lists?.name ?? "—"}</td>
                <td className="py-1">{c.payment_terms}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">No customers yet.</p>
      )}
    </div>
  );
}
