// tests/purchasing-view.test.ts — PO, materials, and vendor adapters plus
// HTML. Views own no sample data. Live NewPoForm / ReceiveForm / CountForm /
// MaterialForm / VendorForm / ContractForm stay wrappers.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ContractView } from "../components/mgr/views/contract";
import { ContractsView } from "../components/mgr/views/contracts";
import { CycleCountView, CycleCountFooter } from "../components/mgr/views/cycle-count";
import { E, splitPinned } from "../components/mgr/e";
import { MaterialView } from "../components/mgr/views/material";
import { MaterialsView } from "../components/mgr/views/materials";
import { MaterialsOnHandView } from "../components/mgr/views/materials-on-hand";
import { NewPoView } from "../components/mgr/views/new-po";
import { PurchaseOrdersView } from "../components/mgr/views/purchase-orders";
import { ReceiptView } from "../components/mgr/views/receipt";
import { ReceivePoView } from "../components/mgr/views/receive-po";
import { VendorView } from "../components/mgr/views/vendor";
import { VendorsView } from "../components/mgr/views/vendors";
import {
  contractYchCitra, contractsList, cycleCountCans, materialCitra, materialsOnHandList,
  newPoCountryMalt, purchaseOrdersWarehouse, receiptPoCountryMalt, receivePoCountryMalt, vendorYch, vendorsList,
} from "../lib/mgr/fixtures/purchasing";
import { toContractViewProps } from "../lib/mgr/contract-view";
import { toContractsViewProps } from "../lib/mgr/contracts-view";
import { toCycleCountViewProps } from "../lib/mgr/cycle-count-view";
import { toMaterialViewProps } from "../lib/mgr/material-view";
import { toMaterialsOnHandViewProps } from "../lib/mgr/materials-on-hand-view";
import { toNewPoViewProps } from "../lib/mgr/new-po-view";
import { toPurchaseOrdersViewProps } from "../lib/mgr/purchase-orders-view";
import { toReceiptViewProps } from "../lib/mgr/receipt-view";
import { toReceivePoViewProps } from "../lib/mgr/receive-po-view";
import { toVendorViewProps } from "../lib/mgr/vendor-view";
import { toVendorsViewProps } from "../lib/mgr/vendors-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

describe("Purchase orders", () => {
  it("the Purchase orders inventory record is PurchaseOrdersView", () => {
    const body = screen("Purchase orders").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Purchase orders").body)).toBe(true);
    expect(body.type).toBe(PurchaseOrdersView);
    expect(body.props.model).toEqual(toPurchaseOrdersViewProps(purchaseOrdersWarehouse));
  });

  it("the live POs list links to a full-page shared New PO form", () => {
    const page = src("app/(app)/purchase-orders/page.tsx");
    expect(page).toMatch(/<PurchaseOrdersView\b/);
    expect(page).toContain('"/purchase-orders/new"');
    expect(page).not.toMatch(/<NewPoForm\b|list=\{/);
    const form = src("app/(app)/purchase-orders/new-po-form.tsx");
    expect(form).toMatch(/<NewPoView\b/);
    expect(form).not.toMatch(/<CommandForm\b/);
  });

  it("the New PO inventory record is NewPoView", () => {
    const body = screen("New PO").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(NewPoView);
    expect(body.props.model).toEqual(toNewPoViewProps(newPoCountryMalt));
  });

  it("shares decimal counts, untracked lot omission, errors and disabled saving", () => {
    const html = htmlOf(createElement(NewPoView, {
      model: { vendor: "vendor-id", vendors: [{ id: "vendor-id", name: "Actual vendor" }], expected: "", lines: [
        { key: "line", title: "Actual material", detail: "each", qty: "1.5", cost: "" },
      ] }, submitting: true, messages: "Request failed",
    }));
    expect(html).toContain('value="vendor-id"');
    expect(html).toContain('value="1.5"');
    expect(html).toContain('step="any"');
    expect(html).toContain("Request failed");
    expect(html).toContain("Saving…");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Expected lot");
    expect(html).not.toContain('href="/purchase-orders"');
    expect(htmlOf(createElement(NewPoView, { model: newPoCountryMalt, footer: null }))).not.toContain("Save draft");
    const page = src("app/(app)/purchase-orders/new/page.tsx");
    expect(page.indexOf('requirePagePermission(ctx, "create_purchase_order"')).toBeLessThan(page.indexOf('runPageQuery("list_vendors"'));
  });

  it("the Receive PO inventory record is ReceivePoView", () => {
    const body = screen("Receive PO").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ReceivePoView);
    expect(body.props.model).toEqual(toReceivePoViewProps(receivePoCountryMalt));
  });

  it("renders Receive purchase order without leaking live hrefs", () => {
    expect(htmlOf(createElement(ReceivePoView, { model: toReceivePoViewProps(receivePoCountryMalt) }))).toMatch(/>Receive purchase order</);
    expect(htmlOf(createElement(ReceivePoView, { model: toReceivePoViewProps(receivePoCountryMalt) }))).not.toMatch(/href="\/purchase-orders"/);
  });

  it("the Receipt inventory record is ReceiptView", () => {
    const body = screen("Receipt").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ReceiptView);
    expect(body.props.model).toEqual(toReceiptViewProps(receiptPoCountryMalt));
  });

  it("the live PO page mounts ReceivePoView and not ReceiptView", () => {
    const page = src("app/(app)/purchase-orders/[id]/page.tsx");
    expect(page).toMatch(/<ReceivePoView\b/);
    expect(page).toMatch(/<ReceiveForm\b/);
    expect(page).not.toMatch(/ReceiptView/);
  });
});

describe("Materials", () => {
  it("the Materials on hand inventory record is MaterialsOnHandView", () => {
    const body = screen("Materials on hand").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(MaterialsOnHandView);
    expect(body.props.model).toEqual(toMaterialsOnHandViewProps(materialsOnHandList));
  });

  it("the Cycle count inventory shares the complete view including its footer", () => {
    const { rest, pin } = splitPinned(screen("Cycle count").body);
    expect((rest[0] as { props: { model: unknown } }).props.model).toEqual(toCycleCountViewProps(cycleCountCans));
    expect(htmlOf(rest)).toContain("Cans · 16 oz");
    expect(htmlOf(rest)).not.toContain("Record count");
    expect(htmlOf(pin)).toBe(htmlOf(E.pin(createElement(CycleCountFooter))));
    expect(src("app/(app)/materials/count-form.tsx")).toContain("footer={E.pin(<CycleCountFooter");
  });

  it("the Materials inventory record is MaterialsView", () => {
    expect((screen("Materials").body as { type: unknown }).type).toBe(MaterialsView);
  });

  it("count keeps real bin identities, decimal input, unavailable allocation and nullable footer", () => {
    const html = htmlOf(createElement(CycleCountView, {
      model: { material: "Actual material", qty: "0.5", units: ["kg"], unitIndex: 0, preview: "system 2 · variance −1.5", locationId: "loc-id", binId: "bin-id", locations: [{ id: "loc-id", name: "Actual location" }], bins: [{ id: "bin-id", name: "Actual bin" }], lotPreviewUnavailable: true },
      submitting: true, messages: "Count failed", footer: null,
    }));
    expect(html).toContain('value="bin-id"');
    expect(html).toContain('value="0.5"');
    expect(html).toContain('step="any"');
    expect(html).toContain("Count failed");
    expect(html).toContain("Lot allocation preview");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Record count");
    expect(html).not.toContain("L-0774");
  });

  it("the Material inventory record is MaterialView", () => {
    expect((screen("Material").body as { type: unknown }).type).toBe(MaterialView);
    const html = htmlOf(createElement(MaterialView, { model: toMaterialViewProps(materialCitra) }));
    expect(html).toMatch(/>Save material</);
    expect(html).toMatch(/Default vendor/);
  });

  it("the live material form mounts the shared controlled body", () => {
    const form = src("app/(app)/materials/material-form.tsx");
    expect(form).toMatch(/from "@\/components\/mgr\/views\/material"/);
    expect(form).toMatch(/<MaterialView\b/);
    expect(form).toMatch(/controls=\{\{/);
    expect(form).not.toMatch(/<Label\b|<Input\b|<Select\b|<Switch\b/);
  });

  it("the live materials page mounts MaterialsOnHandView and slots CountForm", () => {
    const page = src("app/(app)/materials/page.tsx");
    expect(page).toMatch(/<MaterialsOnHandView\b/);
    expect(page).toMatch(/<CountForm\b/);
    expect(page).toMatch(/<MaterialForm\b/);
    expect(page).not.toMatch(/CycleCountView/);
  });
});

describe("Vendors", () => {
  it("the Vendors inventory record is VendorsView", () => {
    expect((screen("Vendors").body as { type: unknown }).type).toBe(VendorsView);
    expect((screen("Vendors").body as { props: { model: unknown } }).props.model).toEqual(toVendorsViewProps(vendorsList));
  });

  it("the Vendor inventory record is VendorView", () => {
    expect((screen("Vendor").body as { type: unknown }).type).toBe(VendorView);
    const html = htmlOf(createElement(VendorView, { model: toVendorViewProps(vendorYch) }));
    expect(html).toMatch(/>Save vendor</);
    expect(html).toMatch(/Phone/);
    expect(html).toContain("Planning uses this lead time to calculate when to buy. Received orders show a separate observed average.");
  });

  it("the live vendor form mounts the shared controlled body", () => {
    const form = src("app/(app)/vendors/vendor-form.tsx");
    expect(form).toMatch(/from "@\/components\/mgr\/views\/vendor"/);
    expect(form).toMatch(/<VendorView\b/);
    expect(form).toMatch(/controls=\{\{/);
    expect(form).not.toMatch(/<Label\b|<Input\b|<Select\b/);
  });

  it("the Contracts inventory record is ContractsView", () => {
    expect((screen("Contracts").body as { type: unknown }).type).toBe(ContractsView);
    expect((screen("Contracts").body as { props: { model: unknown } }).props.model).toEqual(toContractsViewProps(contractsList));
  });

  it("the Contract inventory record is ContractView", () => {
    expect((screen("Contract").body as { type: unknown }).type).toBe(ContractView);
    const html = htmlOf(createElement(ContractView, { model: toContractViewProps(contractYchCitra) }));
    expect(html).toMatch(/>Save contract</);
    expect(html).toMatch(/Contract number/);
  });

  it("the contract's inline field pairs render without a React key warning (E.inline owns the keys)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    htmlOf(createElement(ContractView, { model: toContractViewProps(contractYchCitra) }));
    const errors = error.mock.calls.flat().join(" ");
    error.mockRestore();

    expect(errors).not.toContain('unique "key" prop');
  });

  it("the live contract form mounts the shared controlled body", () => {
    const form = src("app/(app)/vendors/contract-form.tsx");
    expect(form).toMatch(/from "@\/components\/mgr\/views\/contract"/);
    expect(form).toMatch(/<ContractView\b/);
    expect(form).toMatch(/controls=\{controls\}/);
    expect(form).not.toMatch(/<Label\b|<Input\b|<Select\b/);
  });

  it("the live vendors page mounts the shared vendor and contract views", () => {
    const page = src("app/(app)/vendors/page.tsx");
    expect(page).toMatch(/<VendorsView\b/);
    expect(page).toMatch(/<ContractsView\b/);
    expect(page).toMatch(/<VendorForm\b/);
    expect(page).toMatch(/<ContractForm\b/);
  });
});
