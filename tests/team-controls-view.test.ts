import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InviteView, TeamMemberView } from "../components/mgr/views/team-controls";

it("keeps buyer invitations fixed and staff invitations inclusive of taproom", () => {
  const staff = renderToStaticMarkup(createElement(InviteView, { buyer: false, role: "taproom", busy: true, error: "Retry unchanged details" }));
  expect(staff).toContain('type="email"');
  expect(staff).toContain("required");
  expect(staff).toContain("Taproom");
  expect(staff).toContain("disabled");
  expect(staff).toContain("Retry unchanged details");
  const buyer = renderToStaticMarkup(createElement(InviteView, { buyer: true }));
  expect(buyer).toContain("Buyer");
  expect(buyer).not.toContain("Warehouse");
});

it("locks both membership actions during either pending write and retains errors", () => {
  const html = renderToStaticMarkup(createElement(TeamMemberView, { name: "@actual", email: "actual@example.com", savedRole: "brewer", removing: true, error: "Cannot remove the last admin" }));
  expect(html).toContain("Cannot remove the last admin");
  expect(html).toContain("sign-in account remains");
  expect(html).toContain("Removing…");
  expect(html).not.toContain("/mock/");
  expect(html).not.toMatch(/<button(?![^>]*disabled)[^>]*>/);
});
