// app/(app)/customers/[id]/page.tsx — single customer: profile, ship-tos, and
// portal-user invites. Reads through the command registry (get_customer) with
// a brewery-scoped Ctx. Failures throw to the (app) error boundary.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { ShipToForm } from "../ship-to-form";
import { InvitePortalUserForm } from "./invite-portal-user-form";

type Customer = {
  id: string;
  name: string;
  type: string;
  state: string;
  license_no: string | null;
  payment_terms: string;
  price_lists: { name: string } | null;
};
type ShipTo = {
  id: string;
  label: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { customer, shipTos } = (await runCommand("get_customer", { customerId: id }, ctx)) as {
    customer: Customer;
    shipTos: ShipTo[];
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{customer.name}</h1>
          <div className="text-sm text-muted-foreground">
            {customer.type} · {customer.state} · {customer.payment_terms}
            {customer.license_no ? ` · license ${customer.license_no}` : ""}
            {customer.price_lists?.name ? ` · price list: ${customer.price_lists.name}` : ""}
          </div>
        </div>
        <InvitePortalUserForm customerId={customer.id} />
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Ship-tos</h2>
          <ShipToForm customerId={customer.id} />
        </div>
        {shipTos.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-normal">Label</th>
                <th className="py-1 font-normal">Address</th>
                <th className="py-1 font-normal">City</th>
                <th className="py-1 font-normal">State</th>
                <th className="py-1 font-normal">Zip</th>
              </tr>
            </thead>
            <tbody>
              {shipTos.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="py-1">{s.label}</td>
                  <td className="py-1">
                    {s.address1}
                    {s.address2 ? `, ${s.address2}` : ""}
                  </td>
                  <td className="py-1">{s.city}</td>
                  <td className="py-1">{s.state}</td>
                  <td className="py-1">{s.zip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">No ship-tos yet.</p>
        )}
      </section>
    </div>
  );
}
