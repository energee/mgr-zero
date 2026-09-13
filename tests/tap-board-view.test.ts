import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TapBoardView, TapKegView } from "../components/mgr/views/tap-board";
import { openTapBoardSheet } from "../lib/mgr/tap-board-state";
import { tapBoard, tapBoardSkus, kickKeg, swapKeg } from "../lib/mgr/fixtures/taproom";
import { SCREENS } from "../components/mgr/screens";
import { isInertOn } from "../lib/mgr/screen-links";

it("shares guest requirements and coarse fill controls without inventing own SKU volume", () => {
  const state = openTapBoardSheet({ open: [], history: [] }, "tap", null, "actual-location");
  const sheet = { ...state.sheet!, fields: { ...state.sheet!.fields, identity: "guest" as const } };
  const html = renderToStaticMarkup(createElement(TapKegView, { sheet, skus: [] }));
  expect(html).toContain("Guest keg label");
  expect(html).toContain("Guest nominal BBL");
  expect(html).toContain("Opening fill");
  expect(html).toMatch(/maxlength="200"/i);
  expect(html).not.toContain("0.5 bbl");
});

it("retains both keg actions without nesting buttons or inventing yield bars", () => {
  const html = renderToStaticMarkup(createElement(TapBoardView, { state: tapBoard, skus: tapBoardSkus, navigation: { locations: [["Taproom"]], location: "Taproom" } }));
  expect(html.match(/>Swap<\/button>/g)).toHaveLength(tapBoard.snapshot.open.length);
  expect(html.match(/>Kick<\/button>/g)).toHaveLength(tapBoard.snapshot.open.length);
  expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
  expect(html).not.toContain('style="width:');
  expect(html).toContain("no guest yield");
  expect(html).toContain("Recent · Porter · ⅙ bbl tapped");
  expect(html).not.toContain('href="/taproom');
  expect(isInertOn(SCREENS.find(screen => screen.name === "Tap board")!, "Tap keg")).toBe(true);
});

it("keeps the outgoing captured SKU selectable for an atomic same-SKU swap", () => {
  const html = renderToStaticMarkup(createElement(TapKegView, { sheet: swapKeg, skus: [] }));
  expect(html).toContain(swapKeg.interval!.sku_id);
  expect(html).toContain("Same own SKU");
  expect(html).toContain('data-variant="irreversible"');
});

it("freezes kick fields while retaining the unchanged retry", () => {
  const sheet = { ...kickKeg, attempt: { kind: "unknown" as const, requestId: "frozen", payload: { openIntervalId: kickKeg.interval!.id, closeFill: 0 as const, reason: "Kicked empty" } } };
  const html = renderToStaticMarkup(createElement(TapKegView, { sheet, skus: [] }));
  expect(html).toContain("<fieldset disabled");
  expect(html).toContain("Retry unchanged");
  expect(html).not.toContain("Guest keg label");
});
