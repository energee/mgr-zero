// Server transport only. The durable job owns the immutable body and retry window.
import "server-only";

export type OrderEmail = { from: string; to: string; subject: string; text: string };

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
    const concurrent = response.status === 409 && error !== null && typeof error === "object" && "name" in error && error.name === "concurrent_idempotent_requests";
    throw new EmailProviderError(`Email provider rejected request (${response.status})`, concurrent || response.status === 429 || response.status >= 500);
  }
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string" || !result.id) {
    throw new Error("Email provider response has no id");
  }
  return result.id;
}
