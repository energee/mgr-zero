// tests/command-error-copy.test.ts — a command rejection that is not an Error
// (a thrown string, a bare object) must still show customer copy, never the
// internal command verb such as "delete_price_group failed" (#762).
import { expect, it } from "vitest";
import { classifyCommandFailure } from "@/lib/commands/client";

it("gives a non-Error rejection customer copy", () => {
  for (const rejection of ["socket closed", { status: 500 }, null, undefined]) {
    const { message } = classifyCommandFailure(rejection);
    expect(message).toBe("The request did not finish. Try again.");
  }
});

it("distinguishes known first refusals from genuinely ambiguous server outcomes", () => {
  for (const [status, code] of [[400, "validation_error"], [422, "invite_email_invalid"], [429, "rate_limited"], [429, "invite_rate_limited"], [503, "admission_unavailable"]] as const) {
    expect(classifyCommandFailure(Object.assign(new Error("Refused"), { status, code })).kind).toBe("definitive");
  }
  for (const [status, code] of [[401, "unauthorized"], [409, "context_changed"], [408, "timeout"], [429, undefined], [500, "db_error"], [500, "internal_error"], [502, "invite_failed"], [503, undefined]] as const) {
    expect(classifyCommandFailure(Object.assign(new Error("Uncertain"), { status, code })).kind).toBe("unknown");
  }
});
