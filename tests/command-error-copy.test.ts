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
