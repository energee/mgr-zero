// POST /api/email/jobs/digest — builds and queues today's release digests.
// Called once a day by .github/workflows/hosted-jobs.yml with the order email
// job's bearer secret; a brewery is included only on its chosen weekday.
import { authorizeJob } from "@/lib/jobs/auth";
import { runReleaseDigest } from "@/lib/email/jobs";

export async function POST(request: Request) {
  if (!authorizeJob(request, process.env.ORDER_EMAIL_JOB_SECRET)) return Response.json({ ok: false }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await runReleaseDigest()) });
  } catch {
    // The job logs a sanitized stage; never serialize its error here.
    return Response.json({ ok: false }, { status: 500 });
  }
}
