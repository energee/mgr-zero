import { authorizeJob } from "@/lib/jobs/auth";
import { runOrderEmailBatch } from "@/lib/email/jobs";

export async function POST(request: Request) {
  if (!authorizeJob(request, process.env.ORDER_EMAIL_JOB_SECRET)) return Response.json({ ok: false }, { status: 401 });
  try {
    return Response.json({ ok: true, deliveries: await runOrderEmailBatch() });
  } catch {
    // The worker logs sanitized stage/category evidence; never serialize its error here.
    return Response.json({ ok: false }, { status: 500 });
  }
}
