import { pickedCustomerId, selectCustomerMembership } from "@/lib/portal";
import { createRequestAuthContext } from "@/lib/auth/request-context";
import { signInPath } from "@/lib/auth/password";
import { CommandError, type Ctx } from "@/lib/commands/registry";
import { readAppUrl } from "@/lib/env/server-parser";
import { QboOAuthClient, qboConfig, qboPaymentFailureCause, resolvePortalInvoicePayment } from "@/lib/qbo";
import { assertTrustedOrigin } from "@/lib/request-json";

const responseHeaders = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  "Referrer-Policy": "no-referrer",
};

function unavailable(invoiceId: string, reason: string) {
  console.info("qbo_payment_unavailable", { reason });
  return new Response(null, {
    status: 303,
    headers: { ...responseHeaders, Location: new URL(`/portal/invoices/${encodeURIComponent(invoiceId)}?payment=unavailable`, readAppUrl()).href },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
  } catch (error) {
    if (error instanceof CommandError) return new Response(error.message, { status: error.status, headers: responseHeaders });
    throw error;
  }
  const { id } = await params;
  const auth = createRequestAuthContext();
  const identity = await auth.getIdentity();
  if (!identity) return new Response(null, { status: 303, headers: { ...responseHeaders, Location: new URL(signInPath(true), readAppUrl()).href } });
  const membership = selectCustomerMembership(await auth.getCustomerMemberships(), await pickedCustomerId());
  if (!membership) return new Response(null, { status: 303, headers: { ...responseHeaders, Location: new URL("/no-membership", readAppUrl()).href } });
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
    // The buyer stays on Payment unavailable; staff get the cause (missing
    // setup, a CommandError code, an error name) but never a provider body,
    // which can contain credentials or bearer links.
    console.error("qbo_payment_failed", qboPaymentFailureCause(error));
    return unavailable(id, "provider_unavailable");
  }
}
