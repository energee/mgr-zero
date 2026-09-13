import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EntryView } from "../components/mgr/views/entry";
import { toAcceptInviteViewProps } from "../lib/mgr/entry-view";
import { expiredInvite } from "../lib/mgr/fixtures/entry";

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
