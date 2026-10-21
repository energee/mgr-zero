// app/api/retention/jobs/prune/route.ts — scheduler wake for data retention (#766).
// Bearer-authenticated internal job (RETENTION_JOB_SECRET); scheduled daily by .github/workflows/hosted-jobs.yml.
// It prunes old command records, then reaps QuickBooks connects whose callback died mid-exchange (#1034).
import { NextResponse } from "next/server";
import { authorizeJob } from "@/lib/jobs/auth";
import { qboConfig, QboOAuthClient } from "@/lib/qbo";
import { pruneCommandRequests } from "@/lib/retention/jobs";
import { reapQboOAuthExchanges } from "@/lib/supabase/integration-tokens";

export async function POST(request: Request) {
  if (!authorizeJob(request, process.env.RETENTION_JOB_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const pruned = await pruneCommandRequests();
    // The client is built only when a held token needs revoking. The callback is async so a missing
    // QuickBooks setup (qboConfig throws) becomes a logged revoke failure, not a failed job.
    const reapedQboExchanges = await reapQboOAuthExchanges(async (refreshToken) => new QboOAuthClient(qboConfig()).revoke(refreshToken));
    return NextResponse.json({ ok: true, pruned, reapedQboExchanges });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
