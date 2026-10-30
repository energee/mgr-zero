import { pickedCustomerId, selectCustomerMembership } from "@/lib/portal";
import { createRequestAuthContext } from "@/lib/auth/request-context";
import { signInPath } from "@/lib/auth/password";
import { CommandError, type Ctx } from "@/lib/commands/registry";
import { QboOAuthClient, qboConfig, resolvePortalInvoicePayment } from "@/lib/qbo";
import { integrationFailureCause } from "@/lib/integration-failure";

const responseHeaders = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  "Referrer-Policy": "no-referrer",
};

function unavailable(request: Request, invoiceId: string, reason: string) {
  console.info("qbo_payment_unavailable", { reason });
  return new Response(null, {
    status: 303,
    headers: { ...responseHeaders, Location: new URL(`/portal/invoices/${encodeURIComponent(invoiceId)}?payment=unavailable`, request.url).href },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = createRequestAuthContext();
  const identity = await auth.getIdentity();
  if (!identity) return new Response(null, { status: 303, headers: { ...responseHeaders, Location: new URL(signInPath(true), request.url).href } });
  const membership = selectCustomerMembership(await auth.getCustomerMemberships(), await pickedCustomerId());
  if (!membership) return new Response(null, { status: 303, headers: { ...responseHeaders, Location: new URL("/no-membership", request.url).href } });
  const ctx: Ctx = {
    db: await auth.getScopedSupabaseClient({
      "x-mgr-actor-id": identity.userId,
      "x-mgr-brewery-id": membership.breweryId,
      "x-mgr-customer-id": membership.customerId,
    }),
    userId: identity.userId,
    breweryId: membership.breweryId,
    roles: ["customer"],
    customerId: membership.customerId,
  };
  let stage = "payment_config";
  try {
    const client = new QboOAuthClient(qboConfig());
    stage = "payment_resolve";
    const result = await resolvePortalInvoicePayment(ctx, id, client);
    if (result.kind === "redirect") {
      return new Response(null, { status: 302, headers: { ...responseHeaders, Location: result.url } });
    }
    return unavailable(request, id, result.reason);
  } catch (error) {
    if (error instanceof CommandError && error.status === 404) {
      return new Response("Invoice not found", { status: 404, headers: responseHeaders });
    }
    // Keep the buyer on Payment unavailable without logging credentials or bearer links.
    console.error("qbo_payment_failed", integrationFailureCause(error, stage));
    return unavailable(request, id, "provider_unavailable");
  }
}
