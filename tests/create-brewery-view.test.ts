import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CreateBreweryView } from "../components/mgr/views/create-brewery";

it("retains failed creation fields and the rendered actor/request identity", () => {
  const html = renderToStaticMarkup(createElement(CreateBreweryView, { state: { name: "Actual brewery", timezone: "Europe/London", ttb: "Registry", error: "Try again" }, requestId: "same-request", actorId: "same-actor", pending: true }));
  expect(html).toContain('value="Europe/London"');
  expect(html).toContain('value="same-request"');
  expect(html).toContain('value="same-actor"');
  expect(html).toContain('role="alert"');
  expect(html).toContain("Creating…");
  expect(html).toContain("disabled");
  expect(html).not.toMatch(/name="ttb"[^>]*required/);
});

it("does not create fixture request identities or live paths", () => {
  const html = renderToStaticMarkup(createElement(CreateBreweryView, {}));
  expect(html).not.toContain('name="requestId"');
  expect(html).not.toContain('name="actorId"');
  expect(html).not.toContain('href="/');
});
