import { describe, expect, it, vi } from "vitest";
import { E } from "../components/mgr/e";
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
  const html = renderToStaticMarkup(createElement(TapKegView, { sheet, skus: [], timeZone: "America/New_York" }));
  expect(html).toContain("Guest keg label");
  expect(html).toContain("Guest nominal BBL");
  expect(html).toContain("Opening fill");
  expect(html).toMatch(/maxlength="200"/i);
  expect(html).not.toContain("0.5 bbl");
});

it("retains both keg actions without nesting buttons or inventing yield bars", () => {
  const html = renderToStaticMarkup(createElement(TapBoardView, { state: tapBoard, skus: tapBoardSkus, timeZone: "America/New_York", navigation: { locations: [{ value: "taproom", label: "Taproom" }], location: "taproom" } }));
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
  const pick = vi.spyOn(E, "pick");
  const html = renderToStaticMarkup(createElement(TapKegView, { sheet: swapKeg, skus: [], timeZone: "America/New_York" }));
  expect(pick).toHaveBeenCalledWith("Packaged keg SKU", swapKeg.interval!.sku_id, expect.arrayContaining([expect.objectContaining({ value: swapKeg.interval!.sku_id })]), expect.anything());
  expect(pick).toHaveBeenCalledWith("Identity", "same", expect.arrayContaining([{ value: "same", label: "Same own SKU", disabled: false }]), expect.anything());
  pick.mockRestore();
  expect(html).toContain('data-variant="irreversible"');
});

it("freezes kick fields while retaining the unchanged retry", () => {
  const sheet = { ...kickKeg, attempt: { kind: "unknown" as const, requestId: "frozen", payload: { openIntervalId: kickKeg.interval!.id, closeFill: 0 as const, reason: "Kicked empty" } } };
  const html = renderToStaticMarkup(createElement(TapKegView, { sheet, skus: [], timeZone: "America/New_York" }));
  expect(html).toContain("<fieldset disabled");
  expect(html).toContain("Retry unchanged");
  expect(html).not.toContain("Guest keg label");
});

it("closes the keg the history entry names, as its own interval", () => {
  // Tap 7 is appended separately, so tap numbers run ahead of array indices
  // from index 6 on; indexing by tap number lands on the wrong keg, and the
  // board then shows that beer as both kicked and pouring.
  const [closed] = tapBoard.snapshot.history;
  expect(closed.id).toBe("previous-kolsch");
  expect(closed.sku_name).toContain("Kolsch");
  expect(closed.tap_number).toBe("10");
  // The same tap pours a fresh keg now; the closed one is a separate interval.
  const open = tapBoard.snapshot.open.filter(tap => tap.tap_number === closed.tap_number);
  expect(open).toHaveLength(1);
  expect(open[0].id).not.toBe(closed.id);
  expect(open[0].sku_id).toBe(closed.sku_id);
});

describe("Tap keg sheet feedback (#1114)", () => {
  const tap = openTapBoardSheet({ open: [], history: [] }, "tap", null, "actual-location").sheet!;
  const render = (props: Partial<Parameters<typeof TapKegView>[0]> = {}) => renderToStaticMarkup(createElement(TapKegView, { sheet: tap, skus: tapBoardSkus, timeZone: "America/New_York", ...props }));

  it("withholds Tap keg and names what is missing instead of a native bubble", () => {
    const html = render();
    expect(html).toContain("Still needed: a packaged keg SKU.");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*aria-describedby="[^"]+-reason"[^>]*>Tap keg<\/button>/);
    expect(render({ sheet: { ...tap, fields: { ...tap.fields, skuId: tapBoardSkus[0].id } } })).not.toContain("Still needed");
    expect(renderToStaticMarkup(createElement(TapKegView, { sheet: kickKeg, skus: tapBoardSkus, timeZone: "America/New_York" }))).not.toContain("Still needed");
  });

  it("offers no selectable placeholder keg, and says where keg SKUs come from when there are none", () => {
    const pick = vi.spyOn(E, "pick");
    render({ skus: [] });
    const call = pick.mock.calls.find(([label]) => label === "Packaged keg SKU")!;
    pick.mockRestore();
    expect(call[2]).toEqual([]);
    expect(call[3]).toMatchObject({ placeholder: "Choose a keg" });
    expect(render({ skus: [], skusHref: "/catalog" })).toMatch(/No keg SKUs to tap yet\. Guest keg is still available\. <a [^>]*href="\/catalog"[^>]*>Add a keg SKU<\/a>/);
    expect(render({ skus: [], skusHref: null })).toContain("No keg SKUs to tap yet. Guest keg is still available. An admin or sales member adds keg SKUs in Catalog.");
    expect(render()).not.toContain("No keg SKUs");
  });

  it("names both guest needs and marks no guest field before it is left", () => {
    const html = render({ sheet: { ...tap, fields: { ...tap.fields, identity: "guest" } } });
    expect(html).toContain("Still needed: a guest keg label and a guest nominal BBL above zero.");
    expect(html).not.toContain('aria-invalid="true"');
  });

  it("labels the fill chips on one percent scale and the tap number plainly", () => {
    const html = render();
    expect(html).toContain('aria-label="Opening fill"');
    for (const label of ["25%", "50%", "60%", "Full"]) expect(html).toContain(`>${label}</button>`);
    for (const fraction of ["¼", "½"]) expect(html).not.toContain(`>${fraction}</button>`);
    expect(html).toContain("Tap number · optional");
    expect(html).toContain("Two kegs can share a number.");
    expect(html).not.toContain("may repeat");
  });
});
