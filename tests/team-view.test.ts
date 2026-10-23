// tests/team-view.test.ts — Team's pending-invitation rows (#1204): the email,
// then the invited role and the day it was sent in the brewery's time zone.
import { expect, it } from "vitest";
import { toPendingInvitationRows } from "@/lib/mgr/team-view";

it("labels each pending invitation with its role and the brewery-zone day it was sent", () => {
  expect(toPendingInvitationRows([
    { id: "i1", email: "sam@example.com", role: "warehouse", createdAt: "2026-10-22T03:30:00Z" },
  ], "America/New_York")).toEqual([
    { key: "i1", email: "sam@example.com", detail: "Warehouse · Sent Oct 21, 2026" },
  ]);
});
