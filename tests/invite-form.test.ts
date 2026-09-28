import { expect, it } from "vitest";
import { beginRecovery, finishRecovery, readRecoveries } from "@/lib/commands/recovery";

it("shares frozen invitation identity between Team and first-run, including reload", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const context = { actorId: "admin", breweryId: "brewery" };
  const input = { email: "buyer@example.com", role: "sales" };
  const first = beginRecovery(storage, context, "/settings/team", "invite_staff", input).attempt;
  expect(beginRecovery(storage, context, "/onboarding", "invite_staff", input).attempt).toEqual(first);
  expect(() => beginRecovery(storage, context, "/onboarding", "invite_staff", { ...input, email: "other@example.com" })).toThrow("Retry saved request");
  expect(readRecoveries(storage, context)[0].input).toEqual(input);
  finishRecovery(storage, first);
  expect(beginRecovery(storage, context, "/settings/team", "invite_staff", input).attempt.requestId).not.toBe(first.requestId);
});
