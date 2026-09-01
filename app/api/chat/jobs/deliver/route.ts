// app/api/chat/jobs/deliver/route.ts — bounded worker wake: processes pending
// App Home receipts, then leases and delivers due notifications (send/update/
// retry/suppress). Body may carry {limit} (capped at 100 by the lease RPC).
// Bearer-authenticated internal job (CHAT_JOB_SECRET).
import { NextResponse } from "next/server";
import { authorizeJob } from "@/lib/chat/job-auth";
import { runChatCallbackBatch, runChatDeliveryBatch } from "@/lib/chat/jobs";

export async function POST(request: Request) {
  if (!authorizeJob(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const limit = Number((await request.json().catch(() => ({})))?.limit) || 50;
  try {
    const callbacks = await runChatCallbackBatch({ limit });
    const deliveries = await runChatDeliveryBatch({ limit });
    return NextResponse.json({ ok: true, callbacks, deliveries });
  } catch (e) {
    console.error("chat delivery failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
