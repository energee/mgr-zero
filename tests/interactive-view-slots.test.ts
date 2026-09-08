import { cloneElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SCREENS } from "@/components/mgr/screens";

it.each([
  ["Orders", "createAction", "New order"],
  ["Order", "footer", "Cancel order"],
  ["Confirm order", "footer", "Cancel order"],
  ["Complete transfer", "footer", "Complete transfer"],
  ["Put back", "footer", "Put back 3"],
  ["Pars and allocation", "footer", "Adjust selected"],
  ["Order detail", "footer", "Reorder"],
])("%s retains omitted fixture controls but suppresses an explicit null %s", (name, slot, label) => {
  const body = SCREENS.find(screen => screen.name === name)!.body as ReactElement<Record<string, unknown>>;
  const omitted = renderToStaticMarkup(cloneElement(body, { [slot]: undefined }));
  const suppressed = renderToStaticMarkup(cloneElement(body, { [slot]: null }));
  const button = new RegExp(`<button[^>]*>${label}</button>`);
  expect(omitted).toMatch(button);
  expect(suppressed).not.toMatch(button);
  if (name === "Order") expect(suppressed).not.toContain("Cancel asks you to confirm");
});

it("explicit null invoice question and QBO slots suppress their fixture actions", () => {
  const body = SCREENS.find(screen => screen.name === "Invoice")!.body as ReactElement<Record<string, unknown>>;
  const html = renderToStaticMarkup(cloneElement(body, { questionAction: null, qbo: null, qboGate: "not connected" }));
  expect(html).not.toContain("Mark answered");
  expect(html).not.toContain("not connected");
  expect(html).not.toMatch(/>Fix</);
});
