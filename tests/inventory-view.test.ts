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
import { MOVEMENT_KIND_LABELS } from "../lib/movement-form";
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

  it.each([[1, "1 unit"], [2, "2 units"], [1.5, "1.5 units"]] as const)("names %s uncosted units with the correct plural (#1382)", (uncostedUnits, label) => {
    const model = toFinishedGoodsViewProps({ skus: [], value: { cents: 2000, uncostedUnits } });
    const unitLabel = new RegExp(`\\b${label.replace(".", "\\.")}\\b`);
    expect(model.valueLine).toContain("$20.00");
    expect(model.valueLine).toMatch(unitLabel);
    expect(htmlOf(createElement(FinishedGoodsView, { model }))).toMatch(unitLabel);
  });

  it("maps each SKU onto a register row with on hand, allocated, available and its links (#942)", () => {
    const row = (sku: { sku_id: string; name: string }, onHand: string, allocated: string, atp: string, short: boolean) => ({
      key: sku.sku_id, name: sku.name, onHand, allocated, atp, short,
      href: `/inventory/${sku.sku_id}`, shortfallHref: `/replenishment?sku=${sku.sku_id}#shortfalls`,
      movementHref: `/inventory?recordMovement=1&skuId=${sku.sku_id}`,
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

  it("withholds a retired SKU's Record movement, as SKU detail does (#1507)", () => {
    const snapshot = assembleFinishedGoods([{ id: "s1", name: "Retired", active: false }, { id: "s2", name: "Current", active: true }], [{ sku_id: "s1", qty: 2 }, { sku_id: "s2", qty: 3 }], []);
    expect(toFinishedGoodsViewProps(snapshot).rows.map((row) => row.movementHref)).toEqual([null, "/inventory?recordMovement=1&skuId=s2"]);
  });

  it("each live row opens Record movement on its SKU, only for a user who may record one (#1507)", () => {
    const model = toFinishedGoodsViewProps({ skus: [...finishedGoodsList.skus, { id: "s-retired", name: "Retired keg", active: false, on_hand: 1, atp: 1 }] });
    const live = htmlOf(createElement(FinishedGoodsView, { model, createAction: "MOVE", linkRows: true }));
    for (const sku of [SKU_HAZY, SKU_PILS, SKU_STOUT]) {
      expect(live).toMatch(new RegExp(`<a [^>]*href="/inventory\\?recordMovement=1&amp;skuId=${sku.sku_id}">Record movement</a>`));
    }
    expect(live).not.toContain("skuId=s-retired");
    const reader = htmlOf(createElement(FinishedGoodsView, { model, createAction: null, linkRows: true }));
    expect(reader).not.toMatch(/Record movement/);
  });

  it("the inventory draws each row's Record movement inert (#1507)", () => {
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(finishedGoodsList) }));
    // The header's button plus one per row, drawn in both the desk table and
    // the phone list, none of them a link.
    expect(html.match(/<button[^>]*>Record movement<\/button>/g)).toHaveLength(1 + 2 * finishedGoodsList.skus.length);
    expect(html).not.toContain("recordMovement=1");
  });

  it("names an empty list without inventing rows", () => {
    const model = toFinishedGoodsViewProps({ skus: [] });
    expect(model.empty?.title).toBe("No finished goods yet");
    expect(model.rows).toEqual([]);
  });

  it("the inventory drawing offers Record movement, Add SKU in Catalog and a worded Shortfall, with no Review and no live hrefs (#942, #1113)", () => {
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(finishedGoodsList) }));
    // Inert in the frame: the explorer resolves "Record movement" by screen name.
    expect(html).toMatch(/<button[^>]*>Record movement<\/button>/);
    expect(html.indexOf(">Record movement<")).toBeLessThan(html.indexOf(">Add SKU in Catalog<"));
    expect(html).toMatch(/>Add SKU in Catalog</);
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
    expect(html).toMatch(new RegExp(`href="/replenishment\\?sku=${SKU_PILS.sku_id}#shortfalls"[^>]*>Shortfall<`));
    expect(html).not.toMatch(new RegExp(`/replenishment\\?sku=${SKU_HAZY.sku_id}`));
    expect(html).not.toMatch(/>Review</);
  });

  it("live Finished goods puts Record movement and Add SKU in Catalog together in the header, above the table (#1113)", () => {
    const html = htmlOf(createElement(FinishedGoodsView, {
      model: toFinishedGoodsViewProps(finishedGoodsList),
      createAction: "MOVE",
      addSkuHref: "/catalog",
      footer: "LEDGER",
    }));
    const title = html.indexOf(">Finished goods</h1>");
    const move = html.indexOf("MOVE");
    expect(title).toBeGreaterThan(-1);
    expect(move).toBeGreaterThan(title);
    expect(html.slice(move)).toMatch(/^MOVE.*?<a[^>]*href="\/catalog"[^>]*>Add SKU in Catalog<\/a>/);
    expect(html.indexOf("Add SKU in Catalog")).toBeLessThan(html.indexOf("<table"));
    expect(html).toMatch(/LEDGER/);
  });

  it("a user who may not create a SKU gets no Add SKU in Catalog (#1113)", () => {
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(finishedGoodsList), createAction: "MOVE", addSkuHref: null }));
    expect(html).toMatch(/MOVE/);
    expect(html).not.toMatch(/Add SKU/);
  });

  it("a reader who may neither record a movement nor create a SKU gets a bare title, with no empty action row (#1113)", () => {
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(finishedGoodsList), createAction: null, addSkuHref: null }));
    expect(html).toMatch(/<div><div class="flex flex-col gap-1"><a[^>]*>.*?Beer<\/a><h1[^>]*>Finished goods<\/h1><\/div>/);
    expect(html).not.toMatch(/Record movement|Add SKU/);
  });

  it("the live page gates Add SKU in Catalog and the empty SKU picker's link on create_sku, one href for both (#1113)", () => {
    const src = readFileSync("app/(app)/inventory/page.tsx", "utf8");
    expect(src).toMatch(/const skusHref = canRun\(ctx, "create_sku"\) \? "\/catalog" : null;/);
    expect(src).toMatch(/<MovementForm\b[^\n]*skusHref=\{skusHref\}/);
    expect(src).toMatch(/addSkuHref=\{skusHref\}/);
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

});

describe("Record movement view", () => {
  it("maps festival removal onto its kind and the Hazy preview", () => {
    const model = toRecordMovementViewProps(recordMovementFestival);
    expect(model.kind).toBe("Festival removal");
    expect(model.sku).toBe(SKU_HAZY.name);
    expect(model.bin).toBe("Cold");
    expect(model.channel).toBe("Taproom");
    expect(model.lot).toBe("No lot (untracked)");
    expect(model.lotOptions?.map(option => option.value)).toEqual([""]);
    expect(model.preview).toBe(`Preview: −1 SKU unit · ${formatVolume("0.50000000")} · Festival removal · PA · amounts are entered positive`);
  });

  it("lists the live form's kinds in the staff guide's order (#1168)", () => {
    expect(MOVEMENT_KIND_LABELS).toEqual(["Opening balance", "Production in", "Adjustment", "Depletion", "Destruction", "Loss", "Sample", "Festival removal", "Return in"]);
    expect(toRecordMovementViewProps(recordMovementFestival).kindOptions).toEqual(MOVEMENT_KIND_LABELS);
  });

  it("renders Movement type, SKU, Destination state, and Record movement", () => {
    const html = htmlOf(createElement(RecordMovementView, { model: toRecordMovementViewProps(recordMovementFestival) }));
    expect(html).toMatch(/Festival removal/);
    expect(html).toContain('aria-label="Movement type"');
    expect(html).toContain("No lot (untracked)");
    expect(html).toContain(SKU_HAZY.name);
    expect(html).toMatch(/Destination state/);
    expect(html).toMatch(/>Record movement</);
    expect(html).toContain(formatVolume("0.50000000"));
    expect(html).not.toMatch(/→/);
  });

  it("a drawn quantity and destination state error mark their own field, each linked to its message (#1113)", () => {
    const model = { ...toRecordMovementViewProps(recordMovementFestival), destStateInput: true, destState: "P", qty: "-3", errors: { qty: "QTY WRONG", destState: "STATE WRONG" } };
    const html = htmlOf(createElement(RecordMovementView, { model }));
    for (const message of ["QTY WRONG", "STATE WRONG"]) {
      const id = html.match(new RegExp(`id="([^"]+-error)"[^>]*>${message}<`))?.[1];
      expect(id, message).toBeTruthy();
      expect(html).toMatch(new RegExp(`aria-invalid="true"[^>]*aria-describedby="${id}"|aria-describedby="${id}"[^>]*aria-invalid="true"`));
    }
  });

  it("a live form keeps the quantity error back until the field is left (#1113)", () => {
    const model = { ...toRecordMovementViewProps(recordMovementFestival), qty: "-3", errors: { qty: "QTY WRONG" } };
    const html = htmlOf(createElement(RecordMovementView, { model, controls: { qty: () => {} } }));
    expect(html).not.toContain("QTY WRONG");
  });

  it("an empty SKU picker says so and links Catalog, or names who adds SKUs (#1113)", () => {
    const empty = { ...toRecordMovementViewProps(recordMovementFestival), sku: "", skuOptions: [] };
    const drawn = htmlOf(createElement(RecordMovementView, { model: empty }));
    expect(drawn).toMatch(/No SKUs yet\. <a (?=[^>]*data-to="Catalog")(?=[^>]*href="#")[^>]*>Add a SKU</);
    expect(htmlOf(createElement(RecordMovementView, { model: { ...empty, skusHref: "/catalog" } }))).toMatch(/href="\/catalog"[^>]*>Add a SKU</);
    const readOnly = htmlOf(createElement(RecordMovementView, { model: { ...empty, skusHref: null } }));
    expect(readOnly).toContain("No SKUs yet. An admin or sales member adds them in Catalog.");
    expect(readOnly).not.toContain("Add a SKU");
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
    expect(model.sku).toBe("Hazy IPA · ½ bbl");
    expect(model).not.toHaveProperty("backHref");
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

  it("draws no in-sheet title or back link, and names the SKU in a row (#1167)", () => {
    const html = htmlOf(createElement(MovementRecordedView, { model: toMovementRecordedViewProps(movementRecordedFestival) }));
    expect(html).not.toMatch(/<h1\b|<a\b/);
    expect(html).toMatch(/<dt[^>]*>SKU<\/dt><dd[^>]*>Hazy IPA · ½ bbl<\/dd>/);
  });

  it("the Movement recorded inventory record is a sheet drawing MovementRecordedView", () => {
    const record = screen("Movement recorded");
    expect(record.surface).toBe("sheet");
    const body = record.body as { type: unknown; props: { model: unknown } };
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
