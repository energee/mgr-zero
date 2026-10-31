import { authorizeJob } from "@/lib/jobs/auth";
import { runOrderEmailBatch } from "@/lib/email/jobs";

export async function POST(request: Request) {
  if (!authorizeJob(request, process.env.ORDER_EMAIL_JOB_SECRET)) return Response.json({ ok: false }, { status: 401 });
  try {
    const deliveries = await runOrderEmailBatch();
    const failed = deliveries.accepted === 0 && deliveries.retry + deliveries.blocked > 0;
    return Response.json({ ok: !failed, deliveries }, { status: failed ? 503 : 200 });
  } catch {
    // The worker logs sanitized stage/category evidence; never serialize its error here.
    return Response.json({ ok: false }, { status: 500 });
  }
}
