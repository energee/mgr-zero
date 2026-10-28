import { expect, it } from "vitest";
import { z } from "zod";
import { CommandError, defineQuery, runCommand, type Ctx } from "@/lib/commands/registry";
import { inputErrorPresentation } from "@/lib/commands/field-errors";
import { classifyCommandFailure, CommandResponseError } from "@/lib/commands/client";

it("carries structured schema issues without executing the rejected operation", async () => {
  let executed = false;
  defineQuery({ name: "field_error_regression", roles: ["admin"], input: z.object({ email: z.email() }), handler: async () => { executed = true; } });
  const ctx: Ctx = { db: null as unknown as Ctx["db"], userId: "u", breweryId: "b", roles: ["admin"] };
  await expect(runCommand("field_error_regression", { email: "a@b" }, ctx)).rejects.toMatchObject({
    status: 400, code: "invalid_input", message: expect.stringMatching(/email/i),
    issues: [{ path: ["email"], code: "invalid_format", message: expect.any(String) }],
  });
  expect(executed).toBe(false);
});

it("keeps every public schema correction actionable for unmapped callers without executing", async () => {
  let executed = false;
  defineQuery({
    name: "unmapped_field_error_regression", roles: ["admin"],
    input: z.object({
      first: z.string().min(1, "Enter the first value."),
      second: z.string().min(1, "Enter the second value."),
    }),
    handler: async () => { executed = true; },
  });
  const ctx: Ctx = { db: null as unknown as Ctx["db"], userId: "u", breweryId: "b", roles: ["admin"] };
  const failure = await runCommand("unmapped_field_error_regression", { first: "", second: "" }, ctx).catch(error => error);
  if (!(failure instanceof CommandError)) throw new Error("Expected a structured schema rejection.");
  expect(failure).toMatchObject({
    status: 400, code: "invalid_input",
    message: "Enter the first value.; Enter the second value.",
    issues: [
      { path: ["first"], code: "too_small", message: "Enter the first value." },
      { path: ["second"], code: "too_small", message: "Enter the second value." },
    ],
  });
  expect(inputErrorPresentation(failure, [])).toEqual({ error: failure.message, fieldErrors: {} });
  expect(executed).toBe(false);
});

it("projects expected failures to declared fields with corrective copy", () => {
  const failure = { status: 400, code: "invalid_input", message: "Check the submitted values and try again.", issues: [
    { path: ["state"], code: "custom", message: "a US state code" },
    { path: ["zip"], code: "custom", message: "a ZIP code" },
    { path: ["customerPhone"], code: "custom", message: "a phone number" },
  ] };
  expect(inputErrorPresentation(failure, ["state", "zip", "customerPhone"])).toEqual({ error: null, fieldErrors: {
    state: "Choose a US state, such as PA.",
    zip: "Use a 5-digit ZIP code or ZIP+4, such as 15201 or 15201-1234.",
    customerPhone: "Use a phone number, such as (503) 555-0142.",
  } });
  expect(inputErrorPresentation(failure, ["state"]).error).toBe(failure.message);
});

it("preserves unexpected, nested, ambiguous and domain errors", () => {
  for (const failure of [
    { status: 500, code: "internal_error", message: "Uncertain outcome" },
    { status: 400, code: "bad_request", message: "membership already exists" },
    { status: 400, code: "invalid_input", message: "Review lines", issues: [{ path: ["lines", 0, "qty"], code: "custom", message: "bad" }] },
  ]) expect(inputErrorPresentation(failure, ["email"]).error).toBe(failure.message);
});

it("retains issues through client failure classification", () => {
  const issues = [{ path: ["email"], code: "invalid_format", message: "Invalid email address" }];
  const error = new CommandResponseError("Check values", 400, "invalid_input", issues);
  expect(classifyCommandFailure(error)).toMatchObject({ issues, code: "invalid_input", status: 400 });
});

it.each([
  [400, "invalid_input", "definitive"],
  [401, undefined, "unknown"],
  [409, "context_changed", "unknown"],
  [429, "rate_limited", "definitive"],
  [429, "invite_rate_limited", "definitive"],
  [429, undefined, "unknown"],
  [503, "admission_unavailable", "definitive"],
  [503, undefined, "unknown"],
  [500, "internal_error", "unknown"],
] as const)("keeps structured presentation independent of recovery safety for %s/%s", (status, code, kind) => {
  const issues = [{ path: ["email"], code: "invalid_format", message: "Invalid email address" }];
  const detail = classifyCommandFailure(new CommandResponseError("Check values", status, code, issues));
  expect(detail).toMatchObject({ status, kind, issues });
  const presentation = inputErrorPresentation(detail, ["email"]);
  expect(Object.keys(presentation.fieldErrors)).toEqual(code === "invalid_input" ? ["email"] : []);
});

// #1482: an over-limit value is not a malformed one, so a field with its own
// format copy (lead time) still says to enter something smaller.
it("says an over-limit field is too large before its format copy", () => {
  const failure = { status: 400, code: "invalid_input", message: "Enter a number no greater than 2,147,483,647.", issues: [
    { path: ["leadTimeDays"], code: "too_big", message: "Enter a number no greater than 2,147,483,647." },
  ] };
  expect(inputErrorPresentation(failure, ["leadTimeDays"]).fieldErrors).toEqual({ leadTimeDays: "Enter a smaller value." });
});
