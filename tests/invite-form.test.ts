import { expect, it } from "vitest";
import { invitationRequest } from "@/lib/invite-form";

it("keeps a failed invitation identity only for the same brewery, command and input", () => {
  const input = { email: "buyer@example.com", customerId: "customer-a" };
  const first = invitationRequest(null, "brewery-a", "invite_customer_user", input);
  expect(invitationRequest(first, "brewery-a", "invite_customer_user", input)).toBe(first);
  expect(invitationRequest(first, "brewery-b", "invite_customer_user", input).requestId).not.toBe(first.requestId);
  expect(invitationRequest(first, "brewery-a", "invite_staff", input).requestId).not.toBe(first.requestId);
  expect(invitationRequest(first, "brewery-a", "invite_customer_user", { ...input, email: "other@example.com" }).requestId).not.toBe(first.requestId);
  expect(invitationRequest(null, "brewery-a", "invite_customer_user", input).requestId).not.toBe(first.requestId);
});
