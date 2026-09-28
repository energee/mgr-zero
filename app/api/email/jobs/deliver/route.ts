import { authorizeJob } from "@/lib/jobs/auth";
import { runOrderEmailBatch } from "@/lib/email/jobs";

export async function POST(request: Request) {
  if (!authorizeJob(request, process.env.ORDER_EMAIL_JOB_SECRET)) return Response.json({ ok: false }, { status: 401 });
  try {
    return Response.json({ ok: true, deliveries: await runOrderEmailBatch() });
  } catch {
    // Return a failed job response without exposing recipient/body/credentials.
    console.error("Order email delivery job failed");
    return Response.json({ ok: false }, { status: 500 });
  }
}
