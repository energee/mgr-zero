// tests/inventory-view.test.ts — Finished goods and Record movement adapters
// plus HTML, and the receipt line a saved movement toasts. Views own no sample data.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { FinishedGoodsView } from "../components/mgr/views/finished-goods";
import { RecordMovementView } from "../components/mgr/views/record-movement";
import { SKU_HAZY, SKU_PILS, SKU_STOUT } from "../lib/mgr/fixtures/demo";
import { ReverseMovementView } from "../components/mgr/views/reverse-movement";
import { finishedGoodsList, finishedGoodsMovements, recordMovementFestival, reverseMovementAdjustment } from "../lib/mgr/fixtures/inventory";
import { assembleFinishedGoods, movementBbl, skuLabel, toFinishedGoodsViewProps } from "../lib/mgr/finished-goods-view";
import { movementReceiptLine } from "../lib/mgr/movement-recorded-view";
import { toRecordMovementViewProps } from "../lib/mgr/record-movement-view";
import { MOVEMENT_KIND_LABELS } from "../lib/movement-form";
import { toReverseMovementViewProps } from "../lib/mgr/reverse-movement-view";
import { formatVolume } from "../lib/volume";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Finished goods view", () => {
  it("states a movement's barrels to the nearest tenth, not the stored eight decimals", () => {
    expect(movementBbl("0.09677419")).toBe("0.1 bbl");
    expect(movementBbl("-0.50000000")).toBe("-0.5 bbl");
    expect(movementBbl("2.00000000")).toBe("2 bbl");
    expect(finishedGoodsMovements.rows.map((row) => row.detail).join(" ")).not.toMatch(/\d\.\d{2,} bbl/);
  });
  it("renders authorized inventory value and counts uncosted units without valuing them (#810)", () => {
    const snapshot = assembleFinishedGoods([{ id: "s1", name: "Costed keg" }], [{ sku_id: "s1", qty: 4 }], [{ sku_id: "s1", qty: 4 }], { value_cents: 2000.4, uncosted_qty: 1.5 });
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(snapshot), movements: { rows: [] } }));
    expect(html).toContain("Inventory value");
    expect(html).toContain("$20.00");
    expect(html).toContain("1.5 units without cost");
    expect(htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps({ skus: [] }), movements: { rows: [] } }))).not.toContain("Inventory value");
  });

  it("leaves out Inventory value while no unit has a cost, so it never reads $0.00 (#1518)", () => {
    const snapshot = assembleFinishedGoods([{ id: "s1", name: "Opening keg" }], [{ sku_id: "s1", qty: 15 }], [{ sku_id: "s1", qty: 15 }], { value_cents: 0, uncosted_qty: 15 });
    expect(toFinishedGoodsViewProps(snapshot).valueLine).toBeUndefined();
    expect(htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(snapshot), movements: { rows: [] } }))).not.toContain("Inventory value");
  });

  it.each([[1, "1 unit"], [2, "2 units"], [1.5, "1.5 units"]] as const)("names %s uncosted units with the correct plural (#1382)", (uncostedUnits, label) => {
    const model = toFinishedGoodsViewProps({ skus: [], value: { cents: 2000, uncostedUnits } });
    const unitLabel = new RegExp(`\\b${label.replace(".", "\\.")}\\b`);
    expect(model.valueLine).toContain("$20.00");
    expect(model.valueLine).toMatch(unitLabel);
    expect(htmlOf(createElement(FinishedGoodsView, { model, movements: { rows: [] } }))).toMatch(unitLabel);
  });

  it("maps each SKU onto a register row under its brand, with on hand, allocated, available and its links (#942)", () => {
    const row = (sku: { sku_id: string; brand: string; format: string }, bbl: string, onHand: string, allocated: string, atp: string, short: boolean) => ({
      key: sku.sku_id, name: sku.format, group: { brand: sku.brand, onHand: bbl }, onHand, allocated, atp, short,
      href: `/inventory/${sku.sku_id}`, shortfallHref: `/replenishment?sku=${sku.sku_id}#shortfalls`,
      movementHref: `/inventory?recordMovement=1&skuId=${sku.sku_id}`,
    });
    expect(toFinishedGoodsViewProps(finishedGoodsList).rows).toEqual([
      row(SKU_HAZY, "7.5 bbl", "15", "4", "11", false),
      row(SKU_PILS, "1.7 bbl", "18", "24", "−6", true),
      // The fixture stout carries a staff alias, which its heading shows.
      { ...row(SKU_STOUT, "1.5 bbl", "9", "2", "7", false), group: { brand: `${SKU_STOUT.brand} · Winter #2`, onHand: "1.5 bbl" } },
    ]);
  });

  it("groups a brand's SKUs under one heading, in brand then SKU order, and totals their barrels on hand", () => {
    const sku = (id: string, brand: string, format: string, on_hand: number, bbl: number | null) =>
      ({ id, name: `${brand} · ${format}`, brands: { name: brand }, format_volume: { bbl_per_unit: bbl }, on_hand, atp: on_hand });
    const rows = toFinishedGoodsViewProps({ skus: [
      sku("p1", "Pils", "Sixtel", 6, 1 / 6), sku("h2", "Hazy", "Half", 4, 0.5), sku("p2", "Pils", "Case", 10, null), sku("h1", "Hazy", "Case", 10, 0.1),
    ] }).rows;
    expect(rows.map((row) => [row.key, row.name, row.group])).toEqual([
      ["h1", "Case", { brand: "Hazy", onHand: "3 bbl" }],
      ["h2", "Half", undefined],
      // One Pils format has no volume, so the brand states no barrel total.
      ["p2", "Case", { brand: "Pils", onHand: undefined }],
      ["p1", "Sixtel", undefined],
    ]);
  });

  it("heads a brand with its staff alias, as Catalog names it", () => {
    const { rows } = toFinishedGoodsViewProps({ skus: [{ id: "s1", name: "Hazy · Keg", brands: { name: "Hazy", alias: "Batch 12" }, on_hand: 1, atp: 1 }] });
    expect(rows[0]).toMatchObject({ name: "Keg", group: { brand: "Hazy · Batch 12" } });
  });

  it("names a row by its format when the SKU is named after the brand's alias", () => {
    const { rows } = toFinishedGoodsViewProps({ skus: [{ id: "s1", name: "Reptile #6 · Case", brands: { name: "Bearded Dragon", alias: "Reptile #6" }, on_hand: 1, atp: 1 }] });
    expect(rows[0]).toMatchObject({ name: "Case", group: { brand: "Bearded Dragon · Reptile #6" } });
  });

  it("leaves a SKU without a brand ungrouped under its own name", () => {
    expect(toFinishedGoodsViewProps({ skus: [{ id: "s1", name: "Loose keg", on_hand: 1, atp: 1 }] }).rows[0]).toMatchObject({ name: "Loose keg", group: undefined });
  });

  it("draws the brand heading once, quiets a zero Allocated, and keeps each row's Record movement off the phone", () => {
    const sku = (id: string, format: string, atp: number) => ({ id, name: `Hazy · ${format}`, brands: { name: "Hazy" }, on_hand: 5, atp });
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps({ skus: [sku("a", "Case", 5), sku("b", "Half", 3)] }), movements: { rows: [] } }));
    // Once in the desk table and once in the phone list.
    expect(html.match(/>Hazy</g)).toHaveLength(2);
    expect(html.match(/<span class="text-muted-foreground">0<\/span>/g)).toHaveLength(2);
    expect(html).not.toMatch(/<span class="text-muted-foreground">2<\/span>/);
    expect(html.match(/<span class="max-md:hidden"><button[^>]*>Record movement<\/button><\/span>/g)).toHaveLength(4);
  });

  it("lists movements under one heading per day, with the time and a linked source document under each", () => {
    const row = (key: string, day: string, ref?: { label: string; href?: string }) => ({ key, title: `+1 ${key}`, detail: "Adjustment · Warehouse · Cold", day, time: "10:35 AM", ref, outbound: false });
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps({ skus: [] }), movements: { rows: [
      row("a", "Mon, Nov 16", { label: "RUN-1006", href: "/packaging/r1" }), row("b", "Mon, Nov 16", { label: "Count Nov 16" }), row("c", "Sun, Nov 15"),
    ] } }));
    expect(html.match(/>Mon, Nov 16</g)).toHaveLength(1);
    expect(html.match(/>Sun, Nov 15</g)).toHaveLength(1);
    expect(html).toMatch(/<a [^>]*href="\/packaging\/r1"[^>]*>RUN-1006<\/a>/);
    // A count has no page of its own: its label is text.
    expect(html).not.toMatch(/<a [^>]*>Count Nov 16/);
    expect(html).toContain("Count Nov 16");
    // The row's two-line clamp is lifted, and the time has a phone line of its own.
    expect(html).toContain("[&amp;_[data-slot=item-description]]:line-clamp-none");
    expect(html).toMatch(/md:hidden[^>]*>10:35 AM/);
  });

  it("offers the movement Type filter only when the page supplies one, and names an empty filtered ledger", () => {
    const model = toFinishedGoodsViewProps({ skus: [] });
    const type = { value: "loss", options: [{ value: "all", label: "All" }, { value: "loss", label: "Loss" }] };
    expect(htmlOf(createElement(FinishedGoodsView, { model, movements: { rows: [] } }))).not.toContain("Type");
    const html = htmlOf(createElement(FinishedGoodsView, { model, movements: { rows: [], type } }));
    expect(html).toContain("Type");
    expect(html).toContain("No Loss movements recorded");
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
    // Rows come back in name order: Current, then Retired.
    expect(toFinishedGoodsViewProps(snapshot).rows.map((row) => row.movementHref)).toEqual(["/inventory?recordMovement=1&skuId=s2", null]);
  });

  it("each live row opens Record movement on its SKU, only for a user who may record one (#1507)", () => {
    const model = toFinishedGoodsViewProps({ skus: [...finishedGoodsList.skus, { id: "s-retired", name: "Retired keg", active: false, on_hand: 1, atp: 1 }] });
    const live = htmlOf(createElement(FinishedGoodsView, { model, movements: { rows: [] }, createAction: "MOVE", linkRows: true }));
    for (const sku of [SKU_HAZY, SKU_PILS, SKU_STOUT]) {
      expect(live).toMatch(new RegExp(`<a [^>]*href="/inventory\\?recordMovement=1&amp;skuId=${sku.sku_id}">Record movement</a>`));
    }
    expect(live).not.toContain("skuId=s-retired");
    const reader = htmlOf(createElement(FinishedGoodsView, { model, movements: { rows: [] }, createAction: null, linkRows: true }));
    expect(reader).not.toMatch(/Record movement/);
  });

  it("the inventory draws each row's Record movement inert (#1507)", () => {
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(finishedGoodsList), movements: { rows: [] } }));
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
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(finishedGoodsList), movements: { rows: [] } }));
    // Inert in the frame: the explorer resolves "Record movement" by screen name.
    expect(html).toMatch(/<button[^>]*>Record movement<\/button>/);
    expect(html.indexOf(">Record movement<")).toBeLessThan(html.indexOf(">Add SKU in Catalog<"));
    expect(html).toMatch(/>Add SKU in Catalog</);
    expect(html).toMatch(/>Shortfall</);
    expect(html).not.toMatch(/>Review</);
    expect(html).toContain(SKU_HAZY.brand);
    expect(html).toContain(SKU_HAZY.format);
    expect(html).toContain("−6");
    expect(html).not.toMatch(/href="\/inventory\//);
    expect(html).not.toMatch(/href="\/replenishment/);
    expect(html).not.toMatch(/→/);
  });

  it("linkRows makes the SKU name the stock-detail link and Shortfall the replenishment link (#942)", () => {
    const html = htmlOf(createElement(FinishedGoodsView, {
      model: toFinishedGoodsViewProps(finishedGoodsList),
      movements: { rows: [] },
      linkRows: true,
    }));
    expect(html).toMatch(new RegExp(`href="/inventory/${SKU_HAZY.sku_id}"[^>]*>${SKU_HAZY.format}<`));
    expect(html).toMatch(new RegExp(`href="/replenishment\\?sku=${SKU_PILS.sku_id}#shortfalls"[^>]*>Shortfall<`));
    expect(html).not.toMatch(new RegExp(`/replenishment\\?sku=${SKU_HAZY.sku_id}`));
    expect(html).not.toMatch(/>Review</);
  });

  it("a user who may not create a SKU gets no Add SKU in Catalog (#1113)", () => {
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(finishedGoodsList), movements: { rows: [] }, createAction: "MOVE", addSkuHref: null }));
    expect(html).toMatch(/MOVE/);
    expect(html).not.toMatch(/Add SKU/);
  });

  it("a reader who may not record a movement, count the taproom or create a SKU gets no actions (#1113)", () => {
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(finishedGoodsList), movements: { rows: [] }, createAction: null, countHref: null, addSkuHref: null }));
    expect(html).not.toMatch(/Record movement|Record taproom count|Add SKU/);
  });

  it("names a SKU once when its name already starts with the brand (#493)", () => {
    expect(skuLabel({ name: "Hazy IPA · 4 × 12.3 oz cans", brands: { name: "Hazy IPA" } })).toBe("Hazy IPA · 4 × 12.3 oz cans");
    expect(skuLabel({ name: "Case", brands: { name: "Pils" } })).toBe("Pils · Case");
    expect(skuLabel({ name: "Case" })).toBe("Case");
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

describe("Movement receipt line", () => {
  it("names the signed quantity, SKU, kind, state, frozen volume and bin (#1507)", () => {
    expect(movementReceiptLine({ sku: "Hazy IPA · ½ bbl", qty: -1, kind: "Festival removal", destState: "PA", bbl: "-0.5", place: "Taproom / Cold" }))
      .toBe(`−1 Hazy IPA · ½ bbl · Festival removal · PA · ${formatVolume("-0.5")} · Taproom / Cold`);
  });

  it("adds the lot code when the movement carries one", () => {
    expect(movementReceiptLine({ sku: "Pils case", qty: 2, kind: "Adjustment", bbl: 0.1, place: "Warehouse / Dry", lot: "L-7" }))
      .toBe(`+2 Pils case · Adjustment · ${formatVolume(0.1)} · Warehouse / Dry · lot L-7`);
  });

  it("the inventory no longer draws a Movement recorded screen", () => {
    expect(SCREENS.some((s) => s.name === "Movement recorded")).toBe(false);
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

describe("finished goods brand alias", () => {
  const aliased = { id: "s-lion", name: "Animal #33 · Case", brands: { name: "White Lion", alias: "Animal #33" }, on_hand: 4, atp: 4 };

  it("heads an aliased brand's rows with the brand and its alias, and names the row by what is left", () => {
    const model = toFinishedGoodsViewProps({ skus: [aliased] });
    expect(model.rows[0]).toMatchObject({ name: "Case", group: { brand: "White Lion · Animal #33" } });
    expect(htmlOf(createElement(FinishedGoodsView, { model, movements: { rows: [] } }))).toContain("White Lion · Animal #33");
  });

  it("heads a brand without an alias by its name alone", () => {
    const model = toFinishedGoodsViewProps({ skus: [{ ...aliased, brands: { name: "Pils" }, name: "Case" }] });
    expect(model.rows[0]).toMatchObject({ name: "Case", group: { brand: "Pils" } });
  });
});
