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
import { toFinishedGoodsViewProps } from "../lib/mgr/finished-goods-view";
import { toMovementRecordedViewProps } from "../lib/mgr/movement-recorded-view";
import { toRecordMovementViewProps } from "../lib/mgr/record-movement-view";
import { toReverseMovementViewProps } from "../lib/mgr/reverse-movement-view";
import { formatVolume } from "../lib/volume";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Finished goods view", () => {
  it("maps on-hand and ATP onto Review / Shortfall rows", () => {
    const model = toFinishedGoodsViewProps(finishedGoodsList);
    expect(model.rows.map((r) => [r.title, r.detail, r.verb])).toEqual([
      [SKU_HAZY.name, "15 on hand · 4 allocated · ATP 11", "Review"],
      [SKU_PILS.name, "18 on hand · 24 allocated · ATP −6", "Shortfall"],
      [SKU_STOUT.name, "9 on hand · 2 allocated · ATP 7", "Review"],
    ]);
    expect(model.rows[1]?.warning).toBe(true);
    expect(model.rows[1]?.shortfallHref).toBe(`/replenishment?sku=${SKU_PILS.sku_id}`);
  });

  it("names an empty list without inventing rows", () => {
    const model = toFinishedGoodsViewProps({ skus: [] });
    expect(model.empty).toBe("No finished goods yet");
    expect(model.rows).toEqual([]);
  });

  it("the inventory drawing still offers Add SKU, Review, and Shortfall", () => {
    const html = htmlOf(createElement(FinishedGoodsView, { model: toFinishedGoodsViewProps(finishedGoodsList) }));
    expect(html).toMatch(/>Add SKU</);
    expect(html).toMatch(/>Review</);
    expect(html).toMatch(/>Shortfall</);
    expect(html).toContain(SKU_HAZY.name);
    expect(html).toMatch(/ATP −6/);
    expect(html).not.toMatch(/href="\/inventory\//);
    expect(html).not.toMatch(/→/);
  });

  it("linkRows turns Review into the SKU link and keeps Shortfall", () => {
    const html = htmlOf(createElement(FinishedGoodsView, {
      model: toFinishedGoodsViewProps(finishedGoodsList),
      linkRows: true,
    }));
    expect(html).toMatch(new RegExp(`href="/inventory/${SKU_HAZY.sku_id}"`));
    expect(html).toMatch(new RegExp(`href="/replenishment\\?sku=${SKU_PILS.sku_id}"`));
    expect(html).toMatch(/>Review</);
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
});

describe("Record movement view", () => {
  it("maps festival removal onto chips index 4 and the Hazy preview", () => {
    const model = toRecordMovementViewProps(recordMovementFestival);
    expect(model.kind).toBe("festival removal");
    expect(model.kindIndex).toBe(4);
    expect(model.sku).toBe(SKU_HAZY.name);
    expect(model.bin).toBe("Cold");
    expect(model.channel).toBe("Taproom");
    expect(model.preview).toBe(`Preview: −1 SKU unit · ${formatVolume("0.50000000")} · festival removal · PA · amounts are entered positive`);
  });

  it("renders Kind, SKU, Destination state, and Record movement", () => {
    const html = htmlOf(createElement(RecordMovementView, { model: toRecordMovementViewProps(recordMovementFestival) }));
    expect(html).toMatch(/festival removal/);
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
    expect(model.tapeLabel).toBe("−1 keg · festival removal · PA");
    expect(model.tapeDetail).toBe(`${formatVolume("0.50000000")} · just now`);
    expect(model.correctionGate).toMatch(/latest eligible saved weekly count/i);
    expect(model.correctionGate).not.toMatch(/unavailable/i);
  });

  it("renders the tape and Record inventory correction", () => {
    const html = htmlOf(createElement(MovementRecordedView, { model: toMovementRecordedViewProps(movementRecordedFestival) }));
    expect(html).toMatch(/festival removal/);
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
