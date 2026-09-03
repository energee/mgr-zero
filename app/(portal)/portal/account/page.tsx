// app/(portal)/portal/account/page.tsx — the Account tab: which customer
// this login is, with no portal write. Ship-tos and deposits stay brewery-side
// until a customer-safe read exists; the design frame at Account shows the
// target-state list.
import { getActiveCustomer } from "@/lib/portal";

export default async function PortalAccountPage() {
  const customer = await getActiveCustomer();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Account</h1>
      <dl className="flex flex-col text-sm">
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="text-muted-foreground">Customer</dt>
          <dd className="text-right">{customer.customerName}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Contact the brewery to change ship-tos or other account details.
      </p>
    </div>
  );
}
