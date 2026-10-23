// tests/inventory-view.test.ts — Finished goods, Record movement, and
// Movement recorded adapters plus HTML. Views own no sample data.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { FinishedGoodsView } from "../components/mgr/views/finished-goods";
import { MovementRecordedView } from "../components/mgr/views/movement-recorded";
import { RecordMovementView } from "../components/mgr/views/record-movement";
import { SKU_HAZY, SKU_PILS, SKU_STOUT } from "../lib/mgr/fixtures/demo";
import { ReverseMovementView } from "../components/mgr/views/reverse-movement";
import { finishedGoodsList, movementRecordedFestival, recordMovementFestival, reverseMovementAdjustment } from "../lib/mgr/fixtures/inventory";
import { assembleFinishedGoods, skuLabel, toFinishedGoodsViewProps } from "../lib/mgr/finished-goods-view";
import { toMovementRecordedViewProps } from "../lib/mgr/movement-recorded-view";
import { toRecordMovementViewProps } from "../lib/mgr/record-movement-view";
import { toReverseMovementViewProps } from "../lib/mgr/reverse-movement-view";
import { formatVolume } from "../lib/volume";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Finished goods view", () => {
  it("renders authorized inventory value and counts uncosted units without valuing them (#810)", () => {
    const snapshot = assembleFinishedGoods([{ id: "s1", name: "Costed keg" }], [{ sku_id: "s1", qty: 4 }], [{ sku_id: "s1", qty: 4 }], { value_cents: 2000.4, uncosted_qty: 1.5 });
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(snapshot) }));
    expect(html).toContain("Inventory value");
    expect(html).toContain("$20.00");
    expect(html).toContain("1.5 units without cost");
    expect(htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps({ skus: [] }) }))).not.toContain("Inventory value");
  });

  it("maps each SKU onto a register row with on hand, allocated, available and its links (#942)", () => {
    const row = (sku: { sku_id: string; name: string }, onHand: string, allocated: string, atp: string, short: boolean) => ({
      key: sku.sku_id, name: sku.name, onHand, allocated, atp, short,
      href: `/inventory/${sku.sku_id}`, shortfallHref: `/replenishment?sku=${sku.sku_id}`,
    });
    expect(toFinishedGoodsViewProps(finishedGoodsList).rows).toEqual([
      row(SKU_HAZY, "15", "4", "11", false),
      row(SKU_PILS, "18", "24", "−6", true),
      row(SKU_STOUT, "9", "2", "7", false),
    ]);
  });

  it("keeps a known zero available as zero, not a shortfall (#942)", () => {
    const snapshot = assembleFinishedGoods([{ id: "s1", name: "Sold out" }], [{ sku_id: "s1", qty: 5 }], [{ sku_id: "s1", qty: 0 }]);
    expect(toFinishedGoodsViewProps(snapshot).rows[0]).toMatchObject({ onHand: "5", allocated: "5", atp: "0", short: false });
  });

  it("rounds summed decimal on-hand rows to the two-decimal qty (#472)", () => {
    const snapshot = assembleFinishedGoods([{ id: "s1", name: "Hazy" }], [{ sku_id: "s1", qty: "0.10" }, { sku_id: "s1", qty: "0.20" }], [{ sku_id: "s1", qty: "0.10" }]);
    expect(snapshot.skus[0]?.on_hand).toBe(0.3);
    expect(toFinishedGoodsViewProps(snapshot).rows[0]).toMatchObject({ onHand: "0.3", allocated: "0.2", atp: "0.1" });
  });

  it("names an empty list without inventing rows", () => {
    const model = toFinishedGoodsViewProps({ skus: [] });
    expect(model.empty?.title).toBe("No finished goods yet");
    expect(model.rows).toEqual([]);
  });

  it("the inventory drawing offers Add SKU and a worded Shortfall, with no Review and no live hrefs (#942)", () => {
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(finishedGoodsList) }));
    expect(html).toMatch(/>Add SKU</);
    expect(html).toMatch(/>Shortfall</);
    expect(html).not.toMatch(/>Review</);
    expect(html).toContain(SKU_HAZY.name);
    expect(html).toContain("−6");
    expect(html).not.toMatch(/href="\/inventory\//);
    expect(html).not.toMatch(/href="\/replenishment/);
    expect(html).not.toMatch(/→/);
  });

  it("linkRows makes the SKU name the stock-detail link and Shortfall the replenishment link (#942)", () => {
    const html = htmlOf(createElement(FinishedGoodsView, {
      model: toFinishedGoodsViewProps(finishedGoodsList),
      linkRows: true,
    }));
    expect(html).toMatch(new RegExp(`href="/inventory/${SKU_HAZY.sku_id}"[^>]*>${SKU_HAZY.name}<`));
    expect(html).toMatch(new RegExp(`href="/replenishment\\?sku=${SKU_PILS.sku_id}"[^>]*>Shortfall<`));
    expect(html).not.toMatch(new RegExp(`/replenishment\\?sku=${SKU_HAZY.sku_id}`));
    expect(html).not.toMatch(/>Review</);
  });

  it("createAction, afterHeader, and footer slot for live Finished goods", () => {
    const html = htmlOf(createElement(FinishedGoodsView, {
      model: toFinishedGoodsViewProps(finishedGoodsList),
      createAction: "MOVE",
      afterHeader: "ADD SKU",
      footer: "LEDGER",
    }));
    expect(html).toMatch(/MOVE/);
    expect(html).not.toMatch(/>Add SKU</);
    expect(html).toMatch(/ADD SKU/);
    expect(html).toMatch(/LEDGER/);
  });

  it("the Finished goods inventory record is FinishedGoodsView", () => {
    const body = screen("Finished goods").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Finished goods").body)).toBe(true);
    expect(body.type).toBe(FinishedGoodsView);
    expect(body.props.model).toEqual(toFinishedGoodsViewProps(finishedGoodsList));
  });

  it("the live inventory movement receipt uses its shared view", () => {
    const src = readFileSync("app/(app)/inventory/page.tsx", "utf8");
    const form = readFileSync("app/(app)/inventory/movement-form.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/finished-goods"/);
    expect(src).toMatch(/<FinishedGoodsView\b/);
    expect(src).toMatch(/<MovementForm\b/);
    expect(form).not.toContain('title="Record Movement"');
    expect(form).toMatch(/<RecordMovementView\b/);
    expect(form).toMatch(/<MovementRecordedView\b/);
  });

  it("names a SKU once when its name already starts with the brand (#493)", () => {
    expect(skuLabel({ name: "Hazy IPA · 4 × 12.3 oz cans", brands: { name: "Hazy IPA" } })).toBe("Hazy IPA · 4 × 12.3 oz cans");
    expect(skuLabel({ name: "Case", brands: { name: "Pils" } })).toBe("Pils · Case");
    expect(skuLabel({ name: "Case" })).toBe("Case");
  });

  it("does not print the raw movement id on inventory movement rows (#493)", () => {
    const src = readFileSync("app/(app)/inventory/page.tsx", "utf8");
    expect(src).not.toMatch(/ · \{m\.id\}/);
  });

  it("the live movement form picks SKUs by id, not by their non-unique label (#472)", () => {
    const form = readFileSync("app/(app)/inventory/movement-form.tsx", "utf8");
    expect(form).not.toMatch(/item\.label === value/);
    expect(form).toMatch(/skuOptions: skus\.map\(item => \(\{ value: item\.id, label: item\.label \}\)\)/);
  });

  it("opens the deep-linked movement form once instead of reopening after Close", () => {
    const form = readFileSync("app/(app)/inventory/movement-form.tsx", "utf8");
    // Opened by initial state, never by an effect, so Close stays closed (#441).
    // Closing it also clears ?recordMovement and its prefill from the URL (#1107, tests/movement-form.test.ts).
    expect(form).toMatch(/defaultOpen: autoOpen/);
    expect(form).not.toMatch(/setOpen\(true\)/);
  });
});

describe("Record movement view", () => {
  it("maps festival removal onto chips index 4 and the Hazy preview", () => {
    const model = toRecordMovementViewProps(recordMovementFestival);
    expect(model.kind).toBe("Festival removal");
    expect(model.kindIndex).toBe(4);
    expect(model.sku).toBe(SKU_HAZY.name);
    expect(model.bin).toBe("Cold");
    expect(model.channel).toBe("Taproom");
    expect(model.preview).toBe(`Preview: −1 SKU unit · ${formatVolume("0.50000000")} · Festival removal · PA · amounts are entered positive`);
  });

  it("renders Kind, SKU, Destination state, and Record movement", () => {
    const html = htmlOf(createElement(RecordMovementView, { model: toRecordMovementViewProps(recordMovementFestival) }));
    expect(html).toMatch(/Festival removal/);
    expect(html).toContain(SKU_HAZY.name);
    expect(html).toMatch(/Destination state/);
    expect(html).toMatch(/>Record movement</);
    expect(html).toContain(formatVolume("0.50000000"));
    expect(html).not.toMatch(/→/);
  });

  it("the Record movement inventory record mounts RecordMovementView with a sibling pin", () => {
    const kids = (screen("Record movement").body as { props: { children: unknown } }).props.children;
    const list = Array.isArray(kids) ? kids : [kids];
    const view = list.find((c) => isValidElement(c) && c.type === RecordMovementView) as { props: { model: unknown; footer: null } } | undefined;
    expect(view).toBeTruthy();
    expect(view!.props.model).toEqual(toRecordMovementViewProps(recordMovementFestival));
    expect(view!.props.footer).toBeNull();
  });
});

describe("Movement recorded view", () => {
  it("maps the festival echo onto the tape and gated correction", () => {
    const model = toMovementRecordedViewProps(movementRecordedFestival);
    expect(model.title).toBe("Hazy IPA · ½ bbl");
    expect(model.tapeLabel).toBe("−1 keg · Festival removal · PA");
    expect(model.tapeDetail).toBe(`${formatVolume("0.50000000")} · just now`);
    expect(model.correctionGate).toMatch(/latest eligible saved weekly count/i);
    expect(model.correctionGate).not.toMatch(/unavailable/i);
  });

  it("renders the tape and Record inventory correction", () => {
    const html = htmlOf(createElement(MovementRecordedView, { model: toMovementRecordedViewProps(movementRecordedFestival) }));
    expect(html).toMatch(/Festival removal/);
    expect(html).toMatch(/Record inventory correction/);
    expect(html).toContain(formatVolume("0.50000000"));
    expect(html).not.toMatch(/→/);
  });

  it("the Movement recorded inventory record is MovementRecordedView", () => {
    const body = screen("Movement recorded").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(MovementRecordedView);
    expect(body.props.model).toEqual(toMovementRecordedViewProps(movementRecordedFestival));
  });
});

describe("Reverse movement view", () => {
  it("maps the +1 adjustment onto the exact opposite", () => {
    const model = toReverseMovementViewProps(reverseMovementAdjustment);
    expect(model.movement).toBe("+1 adjustment · Warehouse / Cold · Untracked");
    expect(model.exactReversal).toBe("−1 unit · −0.5 bbl");
    expect(model.note).toBe("Entered twice");
  });

  it("renders Confirm reversal and the correction note", () => {
    const html = htmlOf(createElement(ReverseMovementView, { model: toReverseMovementViewProps(reverseMovementAdjustment) }));
    expect(html).toMatch(/>Confirm reversal</);
    expect(html).toMatch(/Correction note/);
    expect(html).toMatch(/Warehouse \/ Cold/);
    expect(html).not.toMatch(/→/);
  });

  it("the Reverse movement inventory record is ReverseMovementView", () => {
    const body = screen("Reverse movement").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ReverseMovementView);
    expect(body.props.model).toEqual(toReverseMovementViewProps(reverseMovementAdjustment));
  });
});
