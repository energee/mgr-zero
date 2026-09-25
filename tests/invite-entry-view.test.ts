import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EntryView } from "../components/mgr/views/entry";
import { toAcceptInviteViewProps, toSetPasswordViewProps } from "../lib/mgr/entry-view";
import { expiredInvite } from "../lib/mgr/fixtures/entry";

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
  expect(toSetPasswordViewProps("a@example.com").note).toBeUndefined();
  expect(toSetPasswordViewProps("a@example.com", "same_password").note).toBe("Choose a password different from your current one.");
  expect(toSetPasswordViewProps("a@example.com", "Call 555-0100 to verify your account").note).toBe("Your password was not saved. Try again.");
});

it("binds verified invitation display data and keeps password validation", () => {
  const model = toAcceptInviteViewProps("Actual brewery", "customer");
  const html = renderToStaticMarkup(createElement(EntryView, { model, defaults: { name: "Actual buyer" } }));
  expect(html).toContain("Join Actual brewery");
  expect(html).toContain("customer");
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
