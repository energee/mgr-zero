// The email job has no user session. Its service access is limited to delivery leases/results.
import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { readOrderEmailEnv } from "@/lib/env/server-parser";
import { EmailProviderError, orderEmailSchema, sendOrderEmail } from "./transport";

// `to` is only required, not re-validated: Auth already accepted the address
// and a stricter check here would throw for the whole leased batch. The
// provider rejects an undeliverable one, which blocks only that row.
const leasesSchema = z.array(z.object({
  id: z.string().uuid(), lease_token: z.string().uuid(),
  lease_expires_at: z.string().datetime({ offset: true }), retry_before: z.string().datetime({ offset: true }),
  payload: orderEmailSchema,
}));

/** Logs fixed categories/stages and validated delivery UUIDs. Transport decides retryability;
 * the job retains generic outcome codes and the RPC enforces the saved retry window and lease. */
export async function runOrderEmailBatch() {
  let stage = "configuration";
  let category = "configuration";
  let deliveryId: string | undefined;
  try {
    const env = readOrderEmailEnv();
    const db = createAdminClient();
    stage = "lease";
    category = "database";
    // Command unwrap logs raw DB messages; this internal job must not use that sink.
    const leased = await db.rpc("lease_order_emails", { p_from: env.from });
    if (leased.error) throw leased.error;
    category = "malformed_response";
    const leases = leasesSchema.parse(leased.data);
    const result = { accepted: 0, retry: 0, blocked: 0 };
    for (const lease of leases) {
      deliveryId = lease.id;
      stage = "send";
      category = "lease_expired";
      let providerId: string | null = null;
      let error: string | null = null;
      if (Date.now() >= Date.parse(lease.lease_expires_at)) throw new Error("Order email lease expired before send");
      if (Date.now() >= Date.parse(lease.retry_before)) {
        error = "retry_window_expired";
        console.error("Order email delivery failure", { stage, category: "retry_window_expired", deliveryId });
      } else {
        try {
          providerId = await sendOrderEmail(lease.id, lease.payload, env.apiKey);
        } catch (e) {
          const uncertain = !(e instanceof EmailProviderError) || e.retryable;
          error = uncertain ? "provider_uncertain" : "provider_rejected";
          console.error("Order email delivery failure", {
            stage, category: e instanceof EmailProviderError ? e.category : "network",
            ...(e instanceof EmailProviderError && e.providerStatus !== undefined ? { providerStatus: e.providerStatus } : {}),
            deliveryId,
          });
        }
      }
      // A database failure after acceptance must escape: the lease can replay the
      // same provider identity, but must not record a contradictory rejection.
      stage = "record_result";
      category = "database";
      const recorded = await db.rpc("finish_order_email", {
        p_delivery: lease.id, p_lease: lease.lease_token, p_provider_id: providerId, p_error: error,
      });
      if (recorded.error) throw recorded.error;
      category = "lease_lost";
      if (!recorded.data) throw new Error("Order email lease no longer owned");
      if (providerId) result.accepted++;
      else if (error === "provider_uncertain") result.retry++;
      else result.blocked++;
    }
    return result;
  } catch (e) {
    // Never serialize the exception: configuration, DB and parse errors may contain secrets or mail.
    console.error("Order email delivery failure", { stage, category, ...(deliveryId ? { deliveryId } : {}) });
    throw e;
  }
}
