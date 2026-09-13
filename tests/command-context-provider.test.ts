// tests/command-context-provider.test.ts — a client component that runs a
// command needs actorId/breweryId from BreweryProvider, which only the (app)
// and (portal) layouts mount. Route groups do not appear in the URL, so moving
// such a page between them is invisible in review; while the context defaulted
// to a blank-but-truthy expectation, the page rendered fine and the command
// failed 400 at the API. Rendering without the provider must throw instead.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BreweryProvider, useBrewery, useCommandContext } from "@/app/(app)/brewery-provider";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const BREWERY = "22222222-2222-4222-8222-222222222222";
const Consumer = () => createElement("span", null, `${useCommandContext().actorId}:${useBrewery()}`);

it("refuses to render a command component outside BreweryProvider", () => {
  expect(() => renderToStaticMarkup(createElement(Consumer))).toThrow(/BreweryProvider is missing/);
});

it("supplies the mounted identity to command components", () => {
  const html = renderToStaticMarkup(createElement(BreweryProvider, { id: BREWERY, actorId: ACTOR }, createElement(Consumer)));
  expect(html).toContain(`${ACTOR}:${BREWERY}`);
});
