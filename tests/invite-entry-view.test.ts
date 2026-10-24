import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccountInvitationsView } from "../components/mgr/views/account-invitations";
import { EntryView } from "../components/mgr/views/entry";
import { passwordReturnHref, toAcceptInviteViewProps, toSetPasswordViewProps } from "../lib/mgr/entry-view";
import { expiredInvite } from "../lib/mgr/fixtures/entry";
import NotFound, { metadata as notFoundMetadata } from "../app/not-found";

it("keeps fixture dependencies out of live password and account entry pages", () => {
  for (const page of ["password", "reset", "no-membership"]) {
    expect(readFileSync(`app/(auth)/${page}/page.tsx`, "utf8")).not.toContain("/fixtures/");
  }
});

it("uses the authenticated account in the shared password form", () => {
  const html = renderToStaticMarkup(createElement(EntryView, { model: toSetPasswordViewProps("actual@example.com") }));
  expect(html).toContain("actual@example.com");
  expect(html).not.toContain("demobrewing");
  expect(html).toMatch(/minlength="8"/i);
});

it("shows fixed text for a ?error= code, never the query string itself (#472)", () => {
  expect(toSetPasswordViewProps("a@example.com").error).toBeUndefined();
  expect(toSetPasswordViewProps("a@example.com", "same_password").error).toBe("Choose a password different from your current one.");
  expect(toSetPasswordViewProps("a@example.com", "Call 555-0100 to verify your account").error).toBe("Your password was not saved. Try again.");
});

it("heads the password page Change password, like the Me link that opens it (#1108)", () => {
  expect(toSetPasswordViewProps("a@example.com").title).toBe("Change password");
});

it("shows password rules and a reveal control before saving, with an explicit exit (#1250)", () => {
  const model = toSetPasswordViewProps("actual@example.com");
  const html = renderToStaticMarkup(createElement(EntryView, { model, secondaryHref: "/orders" }));
  expect(html).toContain("at least 8 characters");
  expect(html.indexOf("at least 8 characters")).toBeLessThan(html.indexOf('name="password"'));
  expect(html).toContain("Show password");
  expect(html).toContain('aria-pressed="false"');
  expect(html).toContain('href="/orders"');
  expect(html).toContain("Back to MGR");
});

it("gives unmatched routes a link to Today (#1250)", () => {
  const html = renderToStaticMarkup(createElement(NotFound));
  expect(html).toContain('href="/"');
  expect(html).toContain("Back to Today");
  expect(notFoundMetadata.title).toBe("Not found");
});

it("keeps password exits local and usable even for a crafted return link (#1250)", () => {
  expect(passwordReturnHref("/orders?status=draft#latest")).toBe("/orders?status=draft#latest");
  expect(passwordReturnHref("/portal/account")).toBe("/portal/account");
  for (const next of [undefined, "//evil.example", "/\\evil.example", "/\t/evil.example", "https://evil.example", "/password", "/.//evil.example"]) {
    expect(passwordReturnHref(next)).toBe("/");
  }
});

it("binds verified invitation display data and keeps password validation", () => {
  const model = toAcceptInviteViewProps("Actual brewery", ["customer"]);
  const html = renderToStaticMarkup(createElement(EntryView, { model, defaults: { name: "Actual buyer" } }));
  expect(html).toContain("Join Actual brewery");
  expect(html).toContain("Customer");
  expect(html).toContain('name="name"');
  expect(html).toContain('value="Actual buyer"');
  expect(html).toContain('type="password"');
  expect(html).toMatch(/minlength="8"/i);
  expect(html).not.toContain('href="/');
});

it("keeps both expired-invite recovery links explicit", () => {
  const html = renderToStaticMarkup(createElement(EntryView, { model: expiredInvite, primaryHref: "/reset", secondaryHref: "/login" }));
  expect(html).toContain('href="/reset"');
  expect(html).toContain('href="/login"');
  expect(renderToStaticMarkup(createElement(EntryView, { model: expiredInvite }))).not.toContain('href="/');
});

it("shows invited roles in sentence case on both invitation landings (#1153)", () => {
  const accept = renderToStaticMarkup(createElement(EntryView, { model: toAcceptInviteViewProps("Actual brewery", ["warehouse", "brewer"]) }));
  expect(accept).toContain("Warehouse, Brewer");
  const invitations = renderToStaticMarkup(createElement(AccountInvitationsView, { invitations: [
    { id: "staff", breweryName: "Actual brewery", kind: "staff", role: "sales", customerName: null, expiresAt: "2026-10-29" },
  ] }));
  expect(invitations).toContain("Staff · Sales");
});
