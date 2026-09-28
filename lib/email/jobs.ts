// The email job has no user session. Its service access is limited to delivery leases/results.
import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { readOrderEmailEnv } from "@/lib/env/server-parser";
import { unwrap } from "@/lib/commands/registry";
import { EmailProviderError, sendOrderEmail } from "./transport";

// `to` is only required, not re-validated: Auth already accepted the address
// and a stricter check here would throw for the whole leased batch. The
// provider rejects an undeliverable one, which blocks only that row.
const leasesSchema = z.array(z.object({
  id: z.string().uuid(), lease_token: z.string().uuid(),
  lease_expires_at: z.string().datetime({ offset: true }), retry_before: z.string().datetime({ offset: true }),
  payload: z.object({ from: z.string().min(1), to: z.string().min(1), subject: z.string(), text: z.string() }),
}));

export async function runOrderEmailBatch() {
  const env = readOrderEmailEnv();
  const db = createAdminClient();
  const leases = leasesSchema.parse(await unwrap(db.rpc("lease_order_emails", { p_from: env.from })));
  const result = { accepted: 0, retry: 0, blocked: 0 };
  for (const lease of leases) {
    let providerId: string | null = null;
    let retry = false;
    let error: string | null = null;
    if (Date.now() >= Date.parse(lease.lease_expires_at)) throw new Error("Order email lease expired before send");
    if (Date.now() >= Date.parse(lease.retry_before)) {
      error = "retry_window_expired";
    } else {
      try {
        providerId = await sendOrderEmail(lease.id, lease.payload, env.apiKey);
      } catch (e) {
        retry = !(e instanceof EmailProviderError) || e.retryable;
        error = retry ? "provider_uncertain" : "provider_rejected";
      }
    }
    // A database failure after acceptance must escape: the lease can replay the
    // same provider identity, but must not record a contradictory rejection.
    const recorded = await unwrap(db.rpc("finish_order_email", {
      p_delivery: lease.id, p_lease: lease.lease_token, p_provider_id: providerId, p_error: error, p_retry: retry,
    }));
    if (!recorded) throw new Error("Order email lease no longer owned");
    if (providerId) result.accepted++;
    else if (retry) result.retry++;
    else result.blocked++;
  }
  return result;
}
