// tests/transfers-view.test.ts — Transfers, New transfer, and Transfer
// detail adapters plus HTML. Views own no sample data.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { NewTransferView } from "../components/mgr/views/new-transfer";
import { TransferDetailView } from "../components/mgr/views/transfer-detail";
import { TransfersView } from "../components/mgr/views/transfers";
import { LOC_TAPROOM, LOC_WAREHOUSE, SKU_HAZY, SKU_PILS } from "../lib/mgr/fixtures/demo";
import { newTransferDraft, transferDetailSubmitted, transfersList } from "../lib/mgr/fixtures/transfers";
import { toNewTransferViewProps } from "../lib/mgr/new-transfer-view";
import { toTransferDetailViewProps } from "../lib/mgr/transfer-detail-view";
import { toTransfersViewProps } from "../lib/mgr/transfers-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Transfers list", () => {
  it("maps list_stock_transfers onto Pick / Receive and Work chips", () => {
    const model = toTransfersViewProps(transfersList);
    expect(model.title).toBe("Work");
    expect(model.workChipIndex).toBe(2);
    expect(model.rows.map((r) => [r.title, r.detail, r.verb])).toEqual([
      ["TRF-0007", `${LOC_WAREHOUSE.name} to ${LOC_TAPROOM.name} · 2 lines · submitted`, "Pick"],
      ["TRF-0006", `${LOC_WAREHOUSE.name} to Storage · 1 line · picked`, "Receive"],
    ]);
  });

  it("live title Transfers omits inventing rows on empty", () => {
    const model = toTransfersViewProps({ transfers: [], title: "Transfers" });
    expect(model.title).toBe("Transfers");
    expect(model.empty).toBe("No transfers yet");
  });

  it("the inventory drawing still offers New transfer, Pick, and Work tabs", () => {
    const html = htmlOf(createElement(TransfersView, { model: toTransfersViewProps(transfersList) }));
    expect(html).toMatch(/>New transfer</);
    expect(html).toMatch(/>Pick</);
    expect(html).toMatch(/>Receive</);
    expect(html).toMatch(/TRF-0007/);
    expect(html).toMatch(/between locations/);
    expect(html).not.toMatch(/href="\/transfers\//);
    expect(html).not.toMatch(/→/);
  });

  it("createAction, tabs null, and linkRows slot for live Transfers", () => {
    const html = htmlOf(createElement(TransfersView, {
      model: toTransfersViewProps({ ...transfersList, title: "Transfers" }),
      createAction: "NEW",
      tabs: null,
      linkRows: true,
    }));
    expect(html).toMatch(/NEW/);
    expect(html).not.toMatch(/>New transfer</);
    expect(html).toMatch(/href="\/transfers\//);
    expect(html).not.toMatch(/>all</);
  });

  it("the Transfers inventory record is TransfersView", () => {
    const body = screen("Transfers").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Transfers").body)).toBe(true);
    expect(body.type).toBe(TransfersView);
    expect(body.props.model).toEqual(toTransfersViewProps(transfersList));
  });

  it("the live Transfers page mounts TransfersView", () => {
    const src = readFileSync("app/(app)/transfers/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/transfers"/);
    expect(src).toMatch(/<TransfersView\b/);
    expect(src).toMatch(/<NewTransferForm\b/);
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
    expect(html).toContain(SKU_HAZY.name);
    expect(html).toContain(SKU_PILS.name);
    expect(html).not.toMatch(/→/);
  });

  it("the New transfer inventory record is NewTransferView", () => {
    const body = screen("New transfer").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(NewTransferView);
    expect(body.props.model).toEqual(toNewTransferViewProps(newTransferDraft));
  });
});

describe("Transfer detail view", () => {
  it("maps TRF-0007 submitted onto Record pick", () => {
    const model = toTransferDetailViewProps(transferDetailSubmitted);
    expect(model.title).toBe("TRF-0007");
    expect(model.from).toBe(LOC_WAREHOUSE.name);
    expect(model.to).toBe(LOC_TAPROOM.name);
    expect(model.status).toBe("submitted");
    expect(model.nextVerb).toBe("Record pick");
    expect(model.received).toBe(false);
    expect(model.lines.map((l) => [l.title, l.detail, l.qty])).toEqual([
      [SKU_HAZY.name, "Walk-in to Cold", "2"],
      [SKU_PILS.name, "Walk-in to Cold", "4"],
    ]);
  });

  it("renders From/to, Status, and Record pick", () => {
    const html = htmlOf(createElement(TransferDetailView, { model: toTransferDetailViewProps(transferDetailSubmitted) }));
    expect(html).toMatch(/TRF-0007/);
    expect(html).toMatch(/Status/);
    expect(html).toMatch(/submitted/);
    expect(html).toMatch(/>Record pick</);
    expect(html).not.toMatch(/→/);
  });

  it("a footer slot replaces Record pick", () => {
    const html = htmlOf(createElement(TransferDetailView, {
      model: toTransferDetailViewProps(transferDetailSubmitted),
      footer: "ACTIONS",
    }));
    expect(html).toMatch(/ACTIONS/);
    expect(html).not.toMatch(/>Record pick</);
  });

  it("the Transfer detail inventory record is TransferDetailView", () => {
    const body = screen("Transfer detail").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(TransferDetailView);
    expect(body.props.model).toEqual(toTransferDetailViewProps(transferDetailSubmitted));
  });

  it("the live transfer page mounts TransferDetailView", () => {
    const src = readFileSync("app/(app)/transfers/[id]/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/transfer-detail"/);
    expect(src).toMatch(/<TransferDetailView\b/);
    expect(src).toMatch(/<TransferActions\b/);
  });
});
