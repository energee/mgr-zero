import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FinishedGoodsView } from "@/components/mgr/views/finished-goods";
import { RepackView, repackFooter } from "@/components/mgr/views/repack";
import { toFinishedGoodsViewProps } from "@/lib/mgr/finished-goods-view";
import { toRepackView } from "@/lib/mgr/repack-view";
import config from "@/next.config";

const emptyRepack = {
  ...toRepackView({ parent: "", unit: "", qty: "", composition: null }),
  parents: [], locations: [{ id: "warehouse", name: "Warehouse" }],
  parentSkuId: "", locationId: "", binId: "", formatsHref: "/catalog",
};

it("explains the missing Repack prerequisite without downstream fields or a commit", () => {
  const html = renderToStaticMarkup(createElement(RepackView, { model: emptyRepack }));
  expect(html).toContain("No SKU can be broken yet");
  expect(html).toContain('href="/catalog"');
  expect(html).not.toMatch(/Location|Untracked stock|Packages to repack|Confirm repack/);
  expect(repackFooter(emptyRepack)).toBeNull();
});

it("asks for the Repack package before revealing its stock fields", () => {
  const model = { ...emptyRepack, parents: [{ id: "case", name: "Case" }] };
  const before = renderToStaticMarkup(createElement(RepackView, { model }));
  expect(before).toContain("Package to break down");
  expect(before).not.toMatch(/Untracked stock|Packages to repack/);
  const after = renderToStaticMarkup(createElement(RepackView, { model: { ...model, parentSkuId: "case" } }));
  expect(after).toContain("Packages to repack");
  expect(after).toContain("Untracked stock");
});

it("redirects the New transfer bookmark to its existing list dialog", async () => {
  expect(await config.redirects!()).toContainEqual({ source: "/transfers/new", destination: "/transfers?newTransfer=1", permanent: false });
});

it("points Inventory at the supported taproom count without inventing a finished-goods count", () => {
  const model = toFinishedGoodsViewProps({ skus: [] });
  const live = renderToStaticMarkup(createElement(FinishedGoodsView, { model, countHref: "/taproom" }));
  expect(live).toMatch(/href="\/taproom"[^>]*>Record taproom count<\/a>/);
  expect(live).toContain("For physical taproom stock");
  const denied = renderToStaticMarkup(createElement(FinishedGoodsView, { model, countHref: null }));
  expect(denied).not.toContain("Record taproom count");
  const fixture = renderToStaticMarkup(createElement(FinishedGoodsView, { model }));
  expect(fixture).toContain('href="#"');
  expect(fixture).toContain('data-to="Weekly count"');
  expect(fixture).not.toContain('href="/taproom"');
});
