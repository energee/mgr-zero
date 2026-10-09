// lib/jobs/auth.ts — constant-time bearer check for the internal job routes.
// Each route passes its own secret: chat (scan/deliver/cleanup) passes
// CHAT_JOB_SECRET, the order email job passes ORDER_EMAIL_JOB_SECRET, the
// retention prune passes RETENTION_JOB_SECRET. There is
// no default, so one job's secret can never admit another job. Compares SHA-256
// digests with timingSafeEqual so length and content leak nothing; callers
// answer a generic 401 and never log either value. An empty or unset secret
// always fails.
import { createHash, timingSafeEqual } from "node:crypto";

export function authorizeJob(request: Request, secret: string | undefined): boolean {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token, extra] = header.split(" ");
  if (!secret || !token || extra || scheme.toLowerCase() !== "bearer") return false;
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
