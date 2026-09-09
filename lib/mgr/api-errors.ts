// lib/mgr/api-errors.ts — every failure POST /api/command can return, with the
// caller's remedy. The codes themselves are raised in app/api/command/route.ts
// and lib/commands/registry.ts; tests/api-docs.test.ts greps those files and
// fails when one is raised that this list does not explain, so the errors page
// cannot fall behind the code that produces it.
export type ApiError = { code: string; status: number; meaning: string; remedy: string };

export const API_ERRORS: ApiError[] = [
  { code: "invalid_request", status: 400, meaning: "The body was not JSON, required envelope fields were missing, or the brewery did not match the operation scope.",
    remedy: "Send `name` and `input`; include `breweryId` for tenant operations and omit it for `provision_brewery`." },
  { code: "invalid_request_id", status: 400, meaning: "A command arrived without a `requestId`, or with one that is not an RFC 9562/4122 UUID.",
    remedy: "Generate a UUID per write and send it; queries may omit it." },
  { code: "invalid_input", status: 400, meaning: "The `input` failed the operation's schema. The message names each offending field.",
    remedy: "Fix the fields the message names. The operation's field table lists types and which are required." },
  { code: "bad_request", status: 400, meaning: "A domain rule refused the write, such as shipping an order that was never picked.",
    remedy: "Read the message: it is the rule, written for a person. Change the state or the input." },
  { code: "duplicate_command", status: 400, meaning: "Two operations tried to register the same name. A server fault, not a caller one.",
    remedy: "Report it; no request will succeed until it is fixed." },
  { code: "unauthenticated", status: 401, meaning: "No usable session cookie or bearer token.",
    remedy: "Send `authorization: Bearer <supabase access_token>`, or call from a logged-in browser session." },
  { code: "not_member", status: 403, meaning: "Authenticated, but not a member of the brewery named by `breweryId`.",
    remedy: "Check the `breweryId`. Membership is staff (`brewery_users`) or a portal user (`customer_users`)." },
  { code: "permission_denied", status: 403, meaning: "A member of the brewery, but the operation does not admit that role.",
    remedy: "Each operation lists the roles allowed to call it; the role matrix collects them." },
  { code: "unknown_command", status: 404, meaning: "No operation is registered under that `name`.",
    remedy: "Check the spelling. An operation marked designed is not registered yet and answers this." },
  { code: "not_found", status: 404, meaning: "An id in the input matches no record the caller may see.",
    remedy: "Confirm the id belongs to this brewery. Row-level security makes another tenant's row indistinguishable from a missing one." },
  { code: "conflict", status: 409, meaning: "A `requestId` was reused with a different payload.",
    remedy: "Reuse a requestId only to retry the identical write; generate a new one for a new write." },
  { code: "context_changed", status: 409, meaning: "The authenticated account, brewery, or customer no longer matches the optional rendered-context expectation.",
    remedy: "Return to the original signed-in context to retry the unchanged action; otherwise review the current state before starting a new request." },
  { code: "db_error", status: 500, meaning: "The database refused the write for a reason not mapped to a public code. Logged server-side.",
    remedy: "Retry once with the same `requestId`. If it persists, quote the `correlationId` from the response." },
  { code: "invite_failed", status: 502, meaning: "The invitation was interrupted before membership completion was confirmed.",
    remedy: "Retry the identical input with the same `requestId`; the saved Auth identity is reused." },
  { code: "missing_execution", status: 500, meaning: "A command reached its handler without execution metadata. A server fault.",
    remedy: "Report it with the `correlationId`." },
  { code: "internal_error", status: 500, meaning: "A handler threw something the endpoint could not map to a public code. A server fault, and the only code whose message carries no detail.",
    remedy: "Retry once with the same `requestId`; a write may or may not have landed, so read the record back before retrying with a new one. Report it with the `correlationId`." },
];
