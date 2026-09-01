// lib/chat/job-auth.ts — constant-time bearer check for the internal chat job
// routes (scan/deliver/cleanup). Compares SHA-256 digests with timingSafeEqual
// so length and content leak nothing; callers answer a generic 401 and never
// log either value.
import { createHash, timingSafeEqual } from "node:crypto";

export function authorizeJob(request: Request): boolean {
  const secret = process.env.CHAT_JOB_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token, extra] = header.split(" ");
  if (!secret || !token || extra || scheme.toLowerCase() !== "bearer") return false;
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
