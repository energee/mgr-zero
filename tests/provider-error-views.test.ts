import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PointOfSaleView } from "@/components/mgr/views/pos";

it.each([true, false])("explains failed OAuth with Connect on the page when connected is %s", (connected) => {
  const html = renderToStaticMarkup(createElement(PointOfSaleView, {
    model: { connected, merchant: "Seller", state: "connected", locations: "", lastSync: "", oauthFailed: true },
  }));
  expect(html).toContain("Square authorization was cancelled or could not finish");
  expect(html).toContain(connected ? ">Reconnect Square</button>" : ">Connect Square</button>");
});
