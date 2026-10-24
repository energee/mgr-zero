import { APICallError, RetryError } from "ai";
import type { ChatFailureCode } from "@/lib/chat/failure";

/** Classify SDK/Gateway errors without returning their raw messages or bodies. */
export function providerFailureCode(cause: unknown): ChatFailureCode {
  const error = RetryError.isInstance(cause) ? cause.lastError : cause;
  if (!(error instanceof Error)) return "unknown";
  const status = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : undefined;
  // Gateway can wrap model-access/credit denials in HTTP 500 (#329). These
  // explicit denials are not transient even when their envelope says 500.
  if (/free tier users do not have access|insufficient[_ ](?:credits|quota)|credit balance|billing|payment required/i.test(error.message)) return "provider_access";
  if (status === 401 || status === 402 || status === 403 || status === 400 || status === 404) return "provider_access";
  if (status === 429) return "rate_limited";
  if (status === 408 || status !== undefined && status >= 500) return "unavailable";
  if (APICallError.isInstance(error) && status === undefined && error.isRetryable) return "unavailable";
  return "unknown";
}
