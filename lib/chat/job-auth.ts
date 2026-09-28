// lib/chat/job-auth.ts — constant-time bearer check for the internal job
// routes: chat (scan/deliver/cleanup, CHAT_JOB_SECRET by default) and the order
// email job (passes ORDER_EMAIL_JOB_SECRET). Compares SHA-256 digests with
// timingSafeEqual so length and content leak nothing; callers answer a generic
// 401 and never log either value. An empty secret always fails; a caller with
// its own secret passes `?? ""` so an unset one cannot fall back to the chat default.
import { createHash, timingSafeEqual } from "node:crypto";

export function authorizeJob(request: Request, secret = process.env.CHAT_JOB_SECRET): boolean {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token, extra] = header.split(" ");
  if (!secret || !token || extra || scheme.toLowerCase() !== "bearer") return false;
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
