// Structured input failures (a 400 invalid_input, or a 409 duplicate name) are
// projected only onto fields a form actually renders.
// Other failures keep their original message and recovery semantics.
import { US_ZIP_CORRECTION } from "@/lib/mgr/ship-to-view";

export type InputIssue = { path: (string | number)[]; code: string; message: string };
export type FieldErrors = Partial<Record<string, string>>;

function correction(issue: InputIssue): string {
  // A unique-name conflict's own message is already the correction (registry uniqueViolation).
  if (issue.code === "duplicate") return issue.message;
  // Over a column's limit, the value's format is fine; only its size is not
  // (#1482). Fixed copy, because a string length issue still carries zod's raw text.
  if (issue.code === "too_big") return "Enter a smaller value.";
  const field = issue.path[0];
  if (field === "state") return "Choose a US state, such as PA.";
  if (field === "zip") return US_ZIP_CORRECTION;
  if (field === "phone" || field === "customerPhone") return "Use a phone number, such as (503) 555-0142.";
  if (field === "email") return "Use a complete email address, such as name@example.com.";
  if (field === "country") return "Choose a country.";
  if (field === "saleChannelId") return "Choose a sale channel.";
  if (field === "leadTimeDays") return "Use a whole number of days, zero or more.";
  if (issue.code === "too_small") return "Enter a value for this field.";
  return "Check this value and try again.";
}

export function inputErrorPresentation(failure: { message: string; status?: number; code?: string; issues?: InputIssue[] }, fields: readonly string[]) {
  const fieldErrors: FieldErrors = {};
  const structured = (failure.status === 400 && failure.code === "invalid_input") || (failure.status === 409 && failure.code === "conflict");
  if (!structured || !failure.issues?.length) {
    return { error: failure.message, fieldErrors };
  }
  let unmapped = false;
  for (const issue of failure.issues) {
    const field = issue.path.length === 1 && typeof issue.path[0] === "string" ? issue.path[0] : undefined;
    if (!field || !fields.includes(field)) { unmapped = true; continue; }
    fieldErrors[field] ??= correction(issue);
  }
  return { error: unmapped ? failure.message : null, fieldErrors };
}
