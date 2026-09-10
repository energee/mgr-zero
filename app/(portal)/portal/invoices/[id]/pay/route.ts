import { createRequestAuthContext } from "@/lib/auth/request-context";
import { CommandError, type Ctx } from "@/lib/commands/registry";
import { QboOAuthClient, qboConfig, resolvePortalInvoicePayment } from "@/lib/qbo";

const responseHeaders = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  "Referrer-Policy": "no-referrer",
};

function unavailable(invoiceId: string, reason: string) {
  console.info("qbo_payment_unavailable", { reason });
  const back = `/portal/invoices/${encodeURIComponent(invoiceId)}`;
  return new Response(`<!doctype html><html><head><title>Payment unavailable</title></head><body><main><h1>Payment unavailable</h1><p>Online payment isn’t available for this invoice right now. Contact the brewery to arrange payment.</p><p><a href="${back}">Return to invoice</a></p></main></body></html>`, {
    status: 200,
    headers: { ...responseHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = createRequestAuthContext();
  const identity = await auth.getIdentity();
  if (!identity) return new Response(null, { status: 303, headers: { ...responseHeaders, Location: new URL("/login", request.url).href } });
  const membership = (await auth.getCustomerMemberships())[0];
  if (!membership) return new Response(null, { status: 303, headers: { ...responseHeaders, Location: new URL("/no-membership", request.url).href } });
  const ctx: Ctx = {
    db: await auth.getScopedSupabaseClient({
      "x-mgr-actor-id": identity.userId,
      "x-mgr-brewery-id": membership.breweryId,
      "x-mgr-customer-id": membership.customerId,
    }),
    userId: identity.userId,
    breweryId: membership.breweryId,
    role: "customer",
    customerId: membership.customerId,
  };
  try {
    const result = await resolvePortalInvoicePayment(ctx, id, new QboOAuthClient(qboConfig()));
    if (result.kind === "redirect") {
      return new Response(null, { status: 302, headers: { ...responseHeaders, Location: result.url } });
    }
    return unavailable(id, result.reason);
  } catch (error) {
    if (error instanceof CommandError && error.status === 404) {
      return new Response("Invoice not found", { status: 404, headers: responseHeaders });
    }
    return unavailable(id, "provider_unavailable");
  }
}
