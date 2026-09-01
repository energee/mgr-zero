// app/api/chat/jobs/scan/route.ts — scheduler wake: scans every brewery with an
// active chat installation for new/stale occurrences and creates deliveries.
// Never posts messages. Bearer-authenticated internal job (CHAT_JOB_SECRET).
import { NextResponse } from "next/server";
import { authorizeJob } from "@/lib/chat/job-auth";
import { runChatScan } from "@/lib/chat/jobs";

export async function POST(request: Request) {
  if (!authorizeJob(request)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runChatScan()) });
  } catch (e) {
    console.error("chat scan failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
