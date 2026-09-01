// app/api/chat/jobs/cleanup/route.ts — deletes expired rows from the private
// Chat SDK state tables (locks, cache, lists, queues; never subscriptions)
// through the restricted pool. Bearer-authenticated internal job.
import { NextResponse } from "next/server";
import { authorizeJob } from "@/lib/chat/job-auth";
import { cleanupChatState } from "@/lib/chat/jobs";

export async function POST(request: Request) {
  if (!authorizeJob(request)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await cleanupChatState()) });
  } catch (e) {
    console.error("chat cleanup failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
