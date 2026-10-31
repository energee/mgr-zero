// tests/transfers-view.test.ts — Transfers, New transfer, and Transfer
// detail adapters plus HTML. Views own no sample data.
import { readFileSync } from "node:fs";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { NewTransferView } from "../components/mgr/views/new-transfer";
import { TransferDetailView } from "../components/mgr/views/transfer-detail";
import { TransferActionsView } from "../components/mgr/views/transfer-actions";
import { CommandForm } from "../components/mgr/command-form";
import { TransfersView } from "../components/mgr/views/transfers";
import { LOC_TAPROOM, LOC_WAREHOUSE, SKU_HAZY, SKU_PILS } from "../lib/mgr/fixtures/demo";
import { newTransferDraft, transferDetailSubmitted, transfersList } from "../lib/mgr/fixtures/transfers";
import { toNewTransferViewProps } from "../lib/mgr/new-transfer-view";
import { toTransferDetailViewProps, transferReceiveSources } from "../lib/mgr/transfer-detail-view";
import { toTransfersViewProps } from "../lib/mgr/transfers-view";
import { WORK_CHIPS, WORK_TABS } from "../lib/mgr/work-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Transfers list", () => {
  it("maps list_stock_transfers onto Receive and Work chips: a submitted transfer skips the pick step (#1507)", () => {
    const model = toTransfersViewProps(transfersList);
    // Each Work kind page is titled by its kind, in the inventory as live (#1037).
    expect(model.title).toBe("Transfers");
    expect(model.workChipIndex).toBe(2);
    expect(model.workChips).toBe(WORK_CHIPS);
    expect(model.workTabs).toBe(WORK_TABS);
    expect(model.rows.map((r) => [r.title, r.detail, r.verb])).toEqual([
      ["TRF-0007", `${LOC_WAREHOUSE.name} to ${LOC_TAPROOM.name} · 2 lines · Submitted`, "Receive"],
      ["TRF-0006", `${LOC_WAREHOUSE.name} to Storage · 1 line · Picked`, "Receive"],
    ]);
  });

  it("a received or cancelled transfer has no verb; its row is a link, not an Open verb (#1026)", () => {
    const base = { from_name: "Warehouse", to_name: "Taproom", line_count: 1 };
    const model = toTransfersViewProps({ transfers: [
      { ...base, id: "rec", transfer_no: 8, status: "received" },
      { ...base, id: "can", transfer_no: 9, status: "cancelled" },
    ] });
    expect(model.rows.map((r) => r.verb)).toEqual([undefined, undefined]);
    const html = htmlOf(createElement(TransfersView, { model, createAction: null, linkRows: true }));
    expect(html).toMatch(/<a[^>]*href="\/transfers\/rec"[^>]*>(?:(?!<\/a>)[\s\S])*TRF-0008/);
    expect(html).toMatch(/<a[^>]*href="\/transfers\/can"[^>]*>(?:(?!<\/a>)[\s\S])*TRF-0009/);
    expect(html).not.toMatch(/>Open</);
  });

  it("live title Transfers omits inventing rows on empty", () => {
    const model = toTransfersViewProps({ transfers: [] });
    expect(model.title).toBe("Transfers");
    expect(model.empty?.title).toBe("No transfers yet");
  });

  it("the inventory drawing still offers New transfer, Receive, and Work tabs", () => {
    const html = htmlOf(createElement(TransfersView, { model: toTransfersViewProps(transfersList) }));
    expect(html).toMatch(/>New transfer</);
    expect(html.match(/>Receive</g)).toHaveLength(2);
    expect(html).toMatch(/TRF-0007/);
    expect(html).toMatch(/between locations/);
    expect(html).not.toMatch(/href="\/transfers\//);
    expect(html).not.toMatch(/→/);
  });

  it("binds live actions and permitted navigation without replacing the tabs", () => {
    const html = htmlOf(createElement(TransfersView, {
      model: toTransfersViewProps(transfersList),
      createAction: "NEW",
      workHrefs: { all: "/work", transfers: "/transfers" },
      linkRows: true,
    }));
    expect(html).toMatch(/NEW/);
    expect(html).not.toMatch(/>New transfer</);
    expect(html).toMatch(/href="\/transfers\//);
    expect(html).toMatch(/href="\/work"/);
    expect(html).toMatch(/href="\/transfers"/);
    expect(html).not.toMatch(/>batches</);
  });

  it("the Transfers inventory record is TransfersView", () => {
    const body = screen("Transfers").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Transfers").body)).toBe(true);
    expect(body.type).toBe(TransfersView);
    expect(body.props.model).toEqual(toTransfersViewProps(transfersList));
  });

  it("the live Transfers page mounts TransfersView", () => {
    const src = readFileSync("app/(app)/transfers/page.tsx", "utf8");
    const form = readFileSync("app/(app)/transfers/new-transfer-form.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/transfers"/);
    expect(src).toMatch(/<TransfersView\b/);
    expect(src).toMatch(/<NewTransferForm\b/);
    expect(form).toMatch(/<NewTransferView\b/);
  });

  it("the live New transfer form picks SKUs by id, not by their non-unique label (#472)", () => {
    const form = readFileSync("app/(app)/transfers/new-transfer-form.tsx", "utf8");
    expect(form).not.toMatch(/sku\.label === value/);
    expect(form).toMatch(/skuOptions: skus\.map\(sku => \(\{ value: sku\.id, label: sku\.label \}\)\)/);
  });
});

describe("New transfer view", () => {
  it("maps Warehouse Walk-in to Taproom Cold with Hazy and Pils steppers", () => {
    const model = toNewTransferViewProps(newTransferDraft);
    expect(model.from).toBe(LOC_WAREHOUSE.name);
    expect(model.to).toBe(LOC_TAPROOM.name);
    expect(model.fromBin).toBe("Walk-in");
    expect(model.toBin).toBe("Cold");
    expect(model.lines.map((l) => [l.title, l.qty])).toEqual([[SKU_HAZY.name, 2], [SKU_PILS.name, 4]]);
  });

  it("renders Create transfer and the two SKU rows", () => {
    const html = htmlOf(createElement(NewTransferView, { model: toNewTransferViewProps(newTransferDraft) }));
    expect(html).toMatch(/>Create transfer</);
    expect(readFileSync("app/(app)/transfers/new-transfer-form.tsx", "utf8")).toMatch(/"Create transfer"/);
    expect(html).toContain(SKU_HAZY.name);
    expect(html).toContain(SKU_PILS.name);
    expect(html).not.toMatch(/→/);
  });

  it("#1584 draws no fractional-quantity info box; the quantity field's own validation says what it takes", () => {
    const html = htmlOf(createElement(NewTransferView, { model: toNewTransferViewProps(newTransferDraft) }));
    expect(html).not.toContain("Fractional quantities");
  });

  it("draws no in-sheet title or back link; the dialog names it (#1120)", () => {
    const html = htmlOf(createElement(NewTransferView, { model: toNewTransferViewProps(newTransferDraft) }));
    expect(html).not.toMatch(/<h1\b|<a\b/);
  });

  it("explains that each disabled bin needs its location first (#1258)", () => {
    const model = { ...toNewTransferViewProps(newTransferDraft), from: "", to: "", fromBin: "", toBin: "", fromBinOptions: [], toBinOptions: [] };
    const html = htmlOf(createElement(NewTransferView, { model }));
    for (const label of ["From bin", "To bin"]) {
      const button = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find(tag => tag.includes(`aria-label="${label}"`));
      expect(button).toMatch(/<button[^>]*\sdisabled(?:=|\s|>)/);
      expect(button).toContain("Choose a location first");
    }
    expect(htmlOf(createElement(NewTransferView, { model: toNewTransferViewProps(newTransferDraft) }))).not.toContain("Choose a location first");
  });

  it("the New transfer inventory record is NewTransferView", () => {
    const body = screen("New transfer").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(NewTransferView);
    expect(body.props.model).toEqual(toNewTransferViewProps(newTransferDraft));
  });
});

describe("Transfer detail view", () => {
  it("maps TRF-0007 submitted onto Receive, which records the pick at the ordered quantities first (#1507)", () => {
    const model = toTransferDetailViewProps(transferDetailSubmitted);
    expect(model.title).toBe("TRF-0007");
    expect(model.from).toBe(LOC_WAREHOUSE.name);
    expect(model.to).toBe(LOC_TAPROOM.name);
    expect(model.status).toBe("Submitted");
    expect(model.nextVerb).toBe("Receive");
    expect(model.received).toBe(false);
    expect(model.lines.map((l) => [l.title, l.detail, l.qty])).toEqual([
      [SKU_HAZY.name, "Walk-in to Cold", "2 units"],
      [SKU_PILS.name, "Walk-in to Cold", "4 units"],
    ]);
  });


  it("an unreceived transfer also offers Cancel transfer; a cancelled one shows its reason and no verb (#578)", () => {
    const submitted = htmlOf(createElement(TransferDetailView, { model: toTransferDetailViewProps(transferDetailSubmitted) }));
    expect(submitted).toMatch(/>Receive</);
    expect(submitted).toMatch(/>Cancel transfer</);
    expect(submitted).toContain("L-0081");
    expect(submitted).toContain("L-0082");
    expect(submitted).toContain("Untracked / legacy stock");
    expect(submitted).toContain('data-variant="irreversible"');
    const cancelled = toTransferDetailViewProps({ ...transferDetailSubmitted, transfer: { ...transferDetailSubmitted.transfer, status: "cancelled", cancel_reason: "over-picked" } });
    expect(cancelled.nextVerb).toBeUndefined();
    const html = htmlOf(createElement(TransferDetailView, { model: cancelled }));
    expect(html).toMatch(/over-picked/);
    expect(html).not.toMatch(/<button\b/);
  });

  it("keeps each line's unit and explains picked quantities", () => {
    const line = transferDetailSubmitted.lines[0];
    const model = toTransferDetailViewProps({ ...transferDetailSubmitted, lines: [
      { ...line, id: "material", name: "Malt", qty: 2.5, unit: "kg" },
      { ...line, id: "keg", name: "Pool", qty: 4, qty_picked: 3, unit: "kegs" },
      { ...line, id: "zero", qty: 2, qty_picked: 0, unit: "units" },
    ] });
    expect(model.lines.map(row => row.qty)).toEqual(["2.5 kg", "3 of 4 kegs", "0 of 2 units"]);
  });


  it("a footer slot replaces the drawn verb", () => {
    const html = htmlOf(createElement(TransferDetailView, {
      model: toTransferDetailViewProps(transferDetailSubmitted),
      footer: "ACTIONS",
    }));
    expect(html).toMatch(/ACTIONS/);
    expect(html).not.toMatch(/>Receive</);
  });

  it("prefills only a sole source, preserves split lot identities, and omits zero quantities", () => {
    const lines = transferDetailSubmitted.sources!;
    expect(transferReceiveSources(lines, {})).toEqual([
      { lineId: "l1", sources: [{ lotId: "lot-hazy", qty: 2 }] },
      { lineId: "l2", sources: [] },
    ]);
    expect(transferReceiveSources(lines, { l1: { "lot-hazy": "" }, l2: { "lot-pils": "3.5", "": "0.5" } })).toEqual([
      { lineId: "l1", sources: [] },
      { lineId: "l2", sources: [{ lotId: "lot-pils", qty: 3.5 }, { lotId: null, qty: 0.5 }] },
    ]);
  });

  it("shares the required cancellation form and keeps command errors beside actions", () => {
    let tree: ReactElement<{ children: ReactNode }>;
    function Capture() {
      tree = TransferActionsView({ lines: [], error: "The transfer changed", busy: true });
      return tree;
    }
    const html = htmlOf(createElement(Capture));
    expect(html).toContain("The transfer changed");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Receive</);
    const dialog = Children.toArray(tree!.props.children).find(child => isValidElement(child) && child.type === CommandForm) as ReactElement<{ children: ReactNode }>;
    const form = htmlOf(dialog.props.children);
    expect(form).toMatch(/<input[^>]*required[^>]*maxLength="500"/i);
    expect(form).toContain("Nothing has left the source bin");
    expect(form).toContain("The transfer changed");
  });

  it("live Receive on a submitted transfer records the ordered pick, then receives (#1507)", () => {
    const src = readFileSync("app/(app)/transfers/[id]/transfer-actions.tsx", "utf8");
    const pick = src.search(/status === "submitted" && !await run\("record_stock_transfer_pick", \{ transferId, picks: lines\.map\(line => \(\{ lineId: line\.id, qty: line\.qty \}\)\) \}\)\) return;/);
    expect(pick).toBeGreaterThan(-1);
    expect(src.indexOf('run("receive_stock_transfer"')).toBeGreaterThan(pick);
  });

  it("the Transfer detail inventory record is TransferDetailView", () => {
    const body = screen("Transfer detail").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(TransferDetailView);
    expect(body.props.model).toEqual(toTransferDetailViewProps(transferDetailSubmitted));
  });

});
