// app/api/retention/jobs/prune/route.ts — scheduler wake for data retention (#766).
// Bearer-authenticated internal job (RETENTION_JOB_SECRET); scheduled daily by .github/workflows/hosted-jobs.yml.
// It prunes old command records, then reaps QuickBooks connects whose callback died mid-exchange (#1034).
import { NextResponse } from "next/server";
import { authorizeJob } from "@/lib/jobs/auth";
import { isQboConfigured, qboConfig, QboOAuthClient, reapQboOAuthExchanges } from "@/lib/qbo";
import { pruneCommandRequests } from "@/lib/retention/jobs";
import { discardQboOAuthTokens, qboRealmInUse, reapStaleQboOAuthExchanges } from "@/lib/supabase/integration-tokens";

export async function POST(request: Request) {
  if (!authorizeJob(request, process.env.RETENTION_JOB_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const pruned = await pruneCommandRequests();
    // Without QuickBooks setup nothing can be revoked, so the reap is skipped and discards nothing (qboReap: null).
    const qboReap = isQboConfigured() ? await reapQboOAuthExchanges(
      { reap: reapStaleQboOAuthExchanges, realmInUse: qboRealmInUse, discard: discardQboOAuthTokens },
      new QboOAuthClient(qboConfig()),
    ) : null;
    const ok = !qboReap || qboReap.failed === 0;
    return NextResponse.json({ ok, pruned, qboReap }, { status: ok ? 200 : 500 });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
