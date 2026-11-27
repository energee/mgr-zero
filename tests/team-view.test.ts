// tests/team-view.test.ts — Team's pending-invitation rows (#1204): the email,
// then the invited role and the day it was sent in the brewery's time zone,
// for existing-account invitations and new-account invitees alike.
import { expect, it } from "vitest";
import { toInvitedMemberRows, toPendingInvitationRows } from "@/lib/mgr/team-view";

it("labels each pending invitation with its role and the brewery-zone day it was sent", () => {
  expect(toPendingInvitationRows([
    { id: "i1", email: "sam@example.com", role: "warehouse", createdAt: "2026-10-22T03:30:00Z" },
  ], "America/New_York")).toEqual([
    { key: "i1", email: "sam@example.com", detail: "Warehouse · Sent Oct 21, 2026" },
  ]);
});

it("lists a new-account invitee under pending invitations, not the roster, until they sign in", () => {
  const base = { email: "jeff@example.com", name: "jeff@example.com", roles: ["admin" as const], createdAt: "2026-11-24T14:35:00Z" };
  expect(toInvitedMemberRows([
    { ...base, userId: "u1", invited: true },
    { ...base, userId: "u2", email: "sam@example.com", invited: false },
  ], "America/New_York")).toEqual([
    { key: "u1", email: "jeff@example.com", detail: "Admin · Sent Nov 24, 2026" },
  ]);
});
