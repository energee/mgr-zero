import { describe, expect, it, vi } from "vitest";
import { E } from "../components/mgr/e";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TapBoardView, TapKegView } from "../components/mgr/views/tap-board";
import { openTapBoardSheet, editTapBoardSheet, beginTapBoardAttempt, fillLabel, OPENING_FILLS, CLOSING_FILLS } from "../lib/mgr/tap-board-state";
import { tapBoard, tapBoardSkus, kickKeg, swapKeg } from "../lib/mgr/fixtures/taproom";
import { SCREENS } from "../components/mgr/screens";
import { isInertOn } from "../lib/mgr/screen-links";

it("shares guest requirements and coarse fill controls without inventing own SKU volume", () => {
  const state = openTapBoardSheet({ open: [], history: [] }, "tap", null, "actual-location");
  const sheet = { ...state.sheet!, fields: { ...state.sheet!.fields, identity: "guest" as const } };
  const html = renderToStaticMarkup(createElement(TapKegView, { sheet, skus: [], timeZone: "America/New_York" }));
  expect(html).toContain("Guest keg label");
  expect(html).toContain("Guest nominal bbl");
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
  expect(html).toContain("Porter · ⅙ bbl tapped");
  expect(html).not.toContain("Recent ·");
  expect(html).toContain('<ul aria-label="Recently tapped kegs"><li>');
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

  it("offers no selectable placeholder and limits Catalog recovery links to an empty picker with permission", () => {
    const pick = vi.spyOn(E, "pick");
    render({ skus: [] });
    const call = pick.mock.calls.find(([label]) => label === "Packaged keg SKU")!;
    pick.mockRestore();
    expect(call[2]).toEqual([]);
    expect(call[3]).toMatchObject({ placeholder: "Choose a keg" });
    expect(render({ skus: [], skusHref: "/catalog" })).toContain('href="/catalog"');
    expect(render({ skus: [], skusHref: null })).not.toMatch(/<a\b/);
    // The inventory passes no href: it must not create an inert recovery link.
    expect(render({ skus: [] })).not.toMatch(/<a\b/);
    expect(render({ skusHref: "/catalog" })).not.toContain('href="/catalog"');
  });

  it("withholds submission without marking untouched guest fields", () => {
    const html = render({ sheet: { ...tap, fields: { ...tap.fields, identity: "guest" } } });
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=/);
    expect(html).not.toContain('aria-invalid="true"');
  });

  it("updates the footer and command through the Identity picker when no keg SKUs exist", () => {
    let state = openTapBoardSheet({ open: [], history: [] }, "tap", null, "actual-location");
    const onEdit = (patch: Parameters<typeof editTapBoardSheet>[1]) => { state = editTapBoardSheet(state, patch); };
    const pick = vi.spyOn(E, "pick");
    render({ sheet: state.sheet!, skus: [], onEdit });
    const identity = pick.mock.calls.find(([label]) => label === "Identity")!;
    pick.mockRestore();
    identity[3]!.onChange!("guest");
    const guestHtml = render({ sheet: state.sheet!, skus: [] });
    expect(guestHtml).not.toContain("Packaged keg SKU");
    expect(guestHtml).toMatch(/<button[^>]*type="submit"[^>]*disabled=/);

    const edit = vi.spyOn(E, "edit");
    render({ sheet: state.sheet!, skus: [], onEdit });
    const label = edit.mock.calls.find(([name]) => name === "Guest keg label")!;
    const size = edit.mock.calls.find(([, , type]) => type === "number")!;
    edit.mockRestore();
    label[4]!.onChange!("Guest cider");
    size[4]!.onChange!("0.25");
    const readyHtml = render({ sheet: state.sheet!, skus: [] });
    expect(readyHtml).not.toMatch(/<button[^>]*type="submit"[^>]*disabled=/);
    const attempt = beginTapBoardAttempt(state, "guest-request").sheet!.attempt;
    expect(attempt).toMatchObject({ kind: "submitting", payload: { keg: { label: "Guest cider", nominalBbl: .25 } } });
    expect(attempt).not.toHaveProperty("payload.keg.skuId");
  });

  it("labels the fill chips on one percent scale and the tap number plainly", () => {
    const html = render();
    expect(html).toContain('aria-label="Opening fill"');
    for (const label of ["25%", "50%", "60%", "Full"]) expect(html).toContain(`>${label}</button>`);
    for (const fraction of ["¼", "½"]) expect(html).not.toContain(`>${fraction}</button>`);
    expect(html).toContain("Tap number · optional");
    expect(html).toContain("Two kegs can share a number. A keg with no number sorts last.");
    expect(html).not.toContain("may repeat");
  });
});

describe("Fill words match the chips (#1192)", () => {
  const board = (state = tapBoard) => renderToStaticMarkup(createElement(TapBoardView, { state, skus: tapBoardSkus, timeZone: "America/New_York", navigation: { locations: [{ value: "taproom", label: "Taproom" }], location: "taproom" } }));

  it("names a stored fill with its chip label", () => {
    expect(fillLabel(OPENING_FILLS, 1)).toBe("Full");
    expect(fillLabel(OPENING_FILLS, .6)).toBe("60%");
    expect(fillLabel(CLOSING_FILLS, 0)).toBe("Empty");
    expect(fillLabel(CLOSING_FILLS, .5)).toBe("About 50% left");
  });

  it("labels the closing fill chips in percent, like the opening fill", () => {
    const html = renderToStaticMarkup(createElement(TapKegView, { sheet: swapKeg, skus: tapBoardSkus, timeZone: "America/New_York" }));
    for (const label of ["Empty", "About 25% left", "About 50% left"]) expect(html).toContain(`>${label}</button>`);
    expect(html).not.toMatch(/[¼½] left/);
  });

  it("prints full for a full opening fill and the chip label for a closing fill", () => {
    const html = board();
    expect(html).toContain("opened full");
    expect(html).toContain("opened 60%");
    expect(html).not.toContain("opened 100%");
    expect(html).toContain("Kicked empty · Empty · closed");
    const [closed] = tapBoard.snapshot.history;
    expect(board({ ...tapBoard, snapshot: { ...tapBoard.snapshot, history: [{ ...closed, closing_fill: .5, close_reason: "Off flavor" }] } })).toContain("Off flavor · About 50% left · closed");
  });
});

describe("Tap board polish (#1302)", () => {
  const render = (state = tapBoard) => renderToStaticMarkup(createElement(TapBoardView, { state, skus: tapBoardSkus, timeZone: "America/New_York", navigation: { locations: [{ value: "taproom", label: "Taproom" }], location: "taproom" } }));

  it("only explains unnumbered sorting when an open keg is unnumbered", () => {
    const numbered = { ...tapBoard, snapshot: { ...tapBoard.snapshot, open: tapBoard.snapshot.open.map(tap => ({ ...tap, tap_number: "3" })) } };
    expect(render(numbered)).not.toContain("Unnumbered kegs sort last.");
    expect(render({ ...numbered, snapshot: { ...numbered.snapshot, open: [{ ...numbered.snapshot.open[0], tap_number: null }] } })).toContain("Unnumbered kegs sort last.");
    expect(render({ ...tapBoard, snapshot: { open: [], history: [] } })).not.toContain("Unnumbered kegs sort last.");
  });

  it("keeps legacy numbers visible and renders supplied actor names without inventing handles", () => {
    const state = { ...tapBoard, snapshot: { open: [{ ...tapBoard.snapshot.open[0], tap_number: "abc", opened_by_label: "Dana Brewer" }], history: [] } };
    const html = render(state);
    expect(html).toContain("abc");
    expect(html).toContain("Dana Brewer");
    expect(html).not.toContain("@Dana Brewer");
    expect(html).not.toMatch(/<[^>]*data-slot="empty"[^>]*>[\s\S]*No closed kegs yet/);
    expect(html).toContain("No closed kegs yet.");
  });

  it("uses a numeric keypad without rounding a long identifier, and names invalid input", () => {
    const state = openTapBoardSheet({ open: [], history: [] }, "tap", null, "taproom", tapBoardSkus[0].id);
    const sheet = { ...state.sheet!, fields: { ...state.sheet!.fields, tapNumber: "abc" } };
    const html = renderToStaticMarkup(createElement(TapKegView, { sheet, skus: tapBoardSkus, timeZone: "America/New_York" }));
    expect(html).toMatch(/inputMode="numeric"/i);
    expect(html).toMatch(/maxLength="80"/i);
    expect(html).toContain("a positive whole tap number up to 9007199254740991, or no number");
    const swap = renderToStaticMarkup(createElement(TapKegView, { sheet: swapKeg, skus: tapBoardSkus, timeZone: "America/New_York" }));
    expect(swap).toContain("Swap closes this keg and opens its replacement together.");
    expect(swap).not.toContain("atomic swap");
    expect(swap).not.toContain("half-finished swap");
  });
});
