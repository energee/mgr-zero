// lib/email/digest.ts — the weekly release digest's work: read today's rows
// (release_digest_rows), word one email per portal user and queue each
// (queue_release_digest). It sends nothing itself: the order email worker
// delivers what is queued, so running it again the same day is safe. The
// service client comes from the email job boundary (./jobs), the only place
// allowed to make one.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { buildReleaseDigests, type DigestRow } from "@/lib/mgr/release-digest";

const num = (value: unknown) => (value == null ? null : Number(value));

/** Builds today's digests and queues them; `portalUrl` is the site's origin, for the link. Logs a fixed stage, never the error: it may hold addresses. */
export async function queueReleaseDigests(db: SupabaseClient<Database>, portalUrl: string) {
  let stage = "read";
  try {
    const rows = await db.rpc("release_digest_rows");
    if (rows.error) throw rows.error;
    stage = "build";
    const digests = buildReleaseDigests((rows.data ?? []).map((row): DigestRow => ({ ...row, bbl_per_unit: num(row.bbl_per_unit), limit_left_bbl: num(row.limit_left_bbl), suggested_qty: num(row.suggested_qty) })), portalUrl);
    stage = "queue";
    let queued = 0;
    for (const digest of digests) {
      const made = await db.rpc("queue_release_digest", { p_brewery: digest.breweryId, p_customer: digest.customerId, p_user: digest.userId, p_week: digest.week, p_subject: digest.subject, p_text: digest.text });
      if (made.error) throw made.error;
      if (made.data) queued += 1;
    }
    return { digests: digests.length, queued };
  } catch (error) {
    console.error("Release digest failure", { stage });
    throw error;
  }
}
