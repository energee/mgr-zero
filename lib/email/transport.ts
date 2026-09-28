// Server transport only. The durable job owns the immutable body and retry window.
import "server-only";
import { z } from "zod";

// `to` is only required, not re-validated: see the lease parse in ./jobs.
export const orderEmailSchema = z.object({ from: z.string().min(1), to: z.string().min(1), subject: z.string(), text: z.string() });
export type OrderEmail = z.infer<typeof orderEmailSchema>;

export class EmailProviderError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); }
}

export async function sendOrderEmail(deliveryId: string, message: OrderEmail, apiKey: string): Promise<string> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `order-confirmation/${deliveryId}` },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    const concurrent = response.status === 409 && (error as { name?: unknown } | null)?.name === "concurrent_idempotent_requests";
    // 401/403 are our key or sending domain, not this buyer: retry until the
    // configuration is fixed rather than permanently blocking the confirmation.
    const ours = response.status === 401 || response.status === 403;
    throw new EmailProviderError(`Email provider rejected request (${response.status})`, concurrent || ours || response.status === 429 || response.status >= 500);
  }
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string" || !result.id) {
    throw new Error("Email provider response has no id");
  }
  return result.id;
}
