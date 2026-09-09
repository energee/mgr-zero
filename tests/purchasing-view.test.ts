// tests/purchasing-view.test.ts — PO, materials, and vendor adapters plus
// HTML. Views own no sample data. Live NewPoForm / ReceiveForm / CountForm /
// MaterialForm / VendorForm / ContractForm stay wrappers.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ContractView } from "../components/mgr/views/contract";
import { ContractsView } from "../components/mgr/views/contracts";
import { CycleCountView } from "../components/mgr/views/cycle-count";
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

  it("the live POs page mounts PurchaseOrdersView and slots NewPoForm", () => {
    const page = src("app/(app)/purchase-orders/page.tsx");
    expect(page).toMatch(/<PurchaseOrdersView\b/);
    expect(page).toMatch(/<NewPoForm\b/);
    expect(page).not.toMatch(/NewPoView/);
  });

  it("the New PO inventory record is NewPoView", () => {
    const body = screen("New PO").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(NewPoView);
    expect(body.props.model).toEqual(toNewPoViewProps(newPoCountryMalt));
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

  it("the Cycle count inventory record mounts CycleCountView with a sibling pin", () => {
    const kids = (screen("Cycle count").body as { props: { children: unknown } }).props.children;
    const list = Array.isArray(kids) ? kids : [kids];
    const view = list.find((c) => isValidElement(c) && c.type === CycleCountView) as { props: { model: unknown; footer: null } } | undefined;
    expect(view).toBeTruthy();
    expect(view!.props.model).toEqual(toCycleCountViewProps(cycleCountCans));
    expect(view!.props.footer).toBeNull();
  });

  it("the Materials inventory record is MaterialsView", () => {
    expect((screen("Materials").body as { type: unknown }).type).toBe(MaterialsView);
  });

  it("the Material inventory record is MaterialView", () => {
    expect((screen("Material").body as { type: unknown }).type).toBe(MaterialView);
    expect(htmlOf(createElement(MaterialView, { model: toMaterialViewProps(materialCitra) }))).toMatch(/>Save material</);
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
    expect(htmlOf(createElement(VendorView, { model: toVendorViewProps(vendorYch) }))).toMatch(/>Save vendor</);
  });

  it("the Contracts inventory record is ContractsView", () => {
    expect((screen("Contracts").body as { type: unknown }).type).toBe(ContractsView);
    expect((screen("Contracts").body as { props: { model: unknown } }).props.model).toEqual(toContractsViewProps(contractsList));
  });

  it("the Contract inventory record is ContractView", () => {
    expect((screen("Contract").body as { type: unknown }).type).toBe(ContractView);
    expect(htmlOf(createElement(ContractView, { model: toContractViewProps(contractYchCitra) }))).toMatch(/>Save contract</);
  });

  it("the live vendors page mounts VendorsView and slots VendorForm / ContractForm", () => {
    const page = src("app/(app)/vendors/page.tsx");
    expect(page).toMatch(/<VendorsView\b/);
    expect(page).toMatch(/<VendorForm\b/);
    expect(page).toMatch(/<ContractForm\b/);
  });
});
