// tests/customers-view.test.ts — Customers list, Customer detail, and
// Ship-to form share adapters with list_customers / get_customer snapshots.
import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { CustomerView } from "../components/mgr/views/customer";
import { CustomersView } from "../components/mgr/views/customers";
import { ShipToView } from "../components/mgr/views/ship-to";
import { customerRidgeline, customersList, shipToMain } from "../lib/mgr/fixtures/customers";
import { ALS, RIDGELINE } from "../lib/mgr/fixtures/demo";
import { toCustomerViewProps } from "../lib/mgr/customer-view";
import { toCustomersViewProps } from "../lib/mgr/customers-view";
import { shipToAddress, toShipToViewProps } from "../lib/mgr/ship-to-view";

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Customers list", () => {
  it("maps list_customers through portal-user and remit copy", () => {
    const model = toCustomersViewProps(customersList);
    expect(model.rows.map((r) => r.title)).toEqual([RIDGELINE.name, ALS.name]);
    expect(model.rows[0]?.detail).toBe("retailer · PA · 2 portal users");
    expect(model.rows[1]?.detail).toBe("retailer · OH · brewery remits");
    expect(model.rows[1]?.warning).toBe(true);
  });

  it("the Customers inventory record is CustomersView", () => {
    const body = screen("Customers").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Customers").body)).toBe(true);
    expect(body.type).toBe(CustomersView);
    expect(body.props.model).toEqual(toCustomersViewProps(customersList));
  });

  it("the inventory list still offers Add customer and Open", () => {
    expect(html(screen("Customers").body)).toMatch(/>Add customer</);
    expect(html(screen("Customers").body)).toMatch(/>Open</);
  });

  it("the live Customers page mounts CustomersView with no second E.* tree", () => {
    const src = readFileSync("app/(app)/customers/page.tsx", "utf8");
    expect(src).toMatch(/<CustomersView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).toMatch(/<CustomerForm\b/);
    expect(src).toMatch(/backHref="/);
  });
});

describe("Customer detail", () => {
  it("associates distributed edit fields with one save form and disables read-only access", () => {
    const model = toCustomerViewProps(customerRidgeline);
    const editable = html(createElement(CustomerView, { model }));
    const formId = editable.match(/<form id="([^"]+)"/)?.[1];
    expect(formId).toBeTruthy();
    expect(editable.match(new RegExp(`form="${formId}"`, "g"))?.length).toBeGreaterThanOrEqual(3);
    const readonly = html(createElement(CustomerView, { model, canWrite: false, footer: null, deleteAction: null }));
    expect(readonly).toContain("disabled");
    expect(readonly).not.toContain(">Save customer<");
    expect(readonly).not.toContain(">Delete customer<");
  });

  it("maps get_customer onto edits, ship-tos, kegs, and orders", () => {
    const model = toCustomerViewProps(customerRidgeline);
    expect(model.name).toBe(RIDGELINE.name);
    expect(model.type).toBe("Retailer");
    expect(model.license).toBe("PA R-55821");
    expect(model.shipTos).toBe("Main · Dock");
    expect(model.kegBalance).toMatch(/38 out/);
    expect(model.orders).toBe("3 open · 42 total");
  });

  it("the Customer detail inventory record is CustomerView", () => {
    const body = screen("Customer detail").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(CustomerView);
    expect(body.props.model).toEqual(toCustomerViewProps(customerRidgeline));
  });

  it("the inventory drawing still has Save customer and Invite", () => {
    const markup = html(screen("Customer detail").body);
    expect(markup).toMatch(/>Save customer</);
    expect(markup).toMatch(/>Invite</);
    expect(markup).toMatch(/Ship-tos/);
  });

  it("the live customer page mounts CustomerView with no second E.* tree", () => {
    const src = readFileSync("app/(app)/customers/[id]/page.tsx", "utf8");
    expect(src).toMatch(/<CustomerDetailForm\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).toMatch(/detail=\{/);
    expect(src).toContain("canWrite={canWrite}");
    expect(src).toMatch(/backHref: "\/customers"/);
    expect(src).toMatch(/<InviteForm\b/);
  });

  it("a detail slot preserves the shared customer editing controls", () => {
    const markup = html(createElement(CustomerView, {
      model: toCustomerViewProps(customerRidgeline),
      detail: { shipTos: [{ key: "s1", title: "Main", detail: "dock" }], kegHref: "/kegs/x" },
    }));
    expect(markup).toMatch(/Type/);
    expect(markup).toMatch(/Retailer/);
    expect(markup).toMatch(/Main/);
    expect(markup).toMatch(/>Open</);
    expect(markup).toMatch(/>Save customer</);
    expect(markup).toMatch(/Customer name/);
  });
});

describe("Ship-to form", () => {
  it("maps a ship-to snapshot onto Main as default", () => {
    const model = toShipToViewProps(shipToMain);
    expect(model.title).toBe("Main ship-to");
    expect(model.city).toBe("Phoenixville");
    expect(model.isDefault).toBe(true);
    expect(toShipToViewProps({ ...shipToMain, address2: "Dock 2" }).address2).toBe("Dock 2");
    // A new ship-to has no label yet; the heading must not read " ship-to".
    expect(toShipToViewProps({ ...shipToMain, label: "" }).title).toBe("New ship-to");
  });

  it("the Ship-to form inventory record is ShipToView", () => {
    const body = screen("Ship-to form").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ShipToView);
    expect(body.props.model).toEqual(toShipToViewProps(shipToMain));
  });

  it("the inventory sheet still shows Save ship-to", () => {
    expect(html(screen("Ship-to form").body)).toMatch(/>Save ship-to</);
  });
});

it("distinguishes a resolved missing-email review from an empty customer book", () => {
  const model = toCustomersViewProps({ customers: [], missingPortalEmail: true });
  expect(model.empty?.title).toBe("All customers have a portal login email");
  const markup = html(createElement(CustomersView, { model, createAction: null, search: null }));
  expect(markup).toContain("Invite");
  expect(markup).toContain("presence");
  expect(markup).not.toContain("No customers yet");
});

it("keeps Accounting Review in the shared filtered customer inventory", () => {
  expect(screen("Accounting").to?.Review).toBe("Customers missing email");
  const body = screen("Customers missing email").body as { type: unknown; props: { model: { missingPortalEmail?: boolean } } };
  expect(body.type).toBe(CustomersView);
  expect(body.props.model.missingPortalEmail).toBe(true);
});

// docs/plans/lolev-orders.md task 3: a country pick, a state only for US, and
// a staff-only alias on the customer and ship-to forms.
describe("country and alias", () => {
  const jp = { ...customerRidgeline, customer: { ...customerRidgeline.customer, name: "Unusual Holdings", country: "JP", state: null, alias: "Tokyo" } };

  it("the list titles a customer with its alias and reads its country when it is not the US", () => {
    const model = toCustomersViewProps({ customers: [
      { ...customersList.customers[0], alias: "Nano Wine" },
      { ...customersList.customers[1], country: "JP", state: null },
    ] });
    expect(model.rows[0]?.title).toBe(`${RIDGELINE.name} · Nano Wine`);
    expect(model.rows[0]?.detail).toBe("retailer · PA · 2 portal users");
    expect(model.rows[1]?.detail).toBe("retailer · Japan · brewery remits");
  });

  it("customer detail edits country and alias, and draws State only for a US customer", () => {
    const us = toCustomerViewProps(customerRidgeline);
    expect(us.editValues).toMatchObject({ country: "US", state: "PA", alias: "" });
    const usMarkup = html(createElement(CustomerView, { model: us }));
    expect(usMarkup).toContain(">Country<");
    expect(usMarkup).toContain(">United States<");
    expect(usMarkup).toContain(">State<");
    expect(usMarkup).toContain('placeholder="Staff only"');
    const foreign = toCustomerViewProps(jp);
    expect(foreign.editValues).toMatchObject({ country: "JP", state: "", alias: "Tokyo" });
    const jpMarkup = html(createElement(CustomerView, { model: foreign }));
    expect(jpMarkup).toContain(">Japan<");
    expect(jpMarkup).not.toContain(">State<");
  });

  it("the save input sends country and alias, a state only for US, and drops a blank alias", async () => {
    const { upsertCustomerInput } = await import("../app/(app)/customers/customer-form");
    const base = { name: "X", type: "retailer", saleChannelId: "c", licenseNumber: "", paymentTerms: "net30", taxTreatment: "" };
    expect(upsertCustomerInput({ ...base, country: "US", state: "pa", alias: "" })).toMatchObject({ country: "US", state: "PA", alias: undefined });
    expect(upsertCustomerInput({ ...base, country: "JP", state: "PA", alias: " Tokyo " })).toMatchObject({ country: "JP", state: undefined, alias: " Tokyo " });
  });

  it("the ship-to form draws State only for a US address", () => {
    const us = html(createElement(ShipToView, { model: toShipToViewProps(shipToMain) }));
    expect(us).toContain(">Country<");
    expect(us).toContain(">State<");
    const foreign = toShipToViewProps({ label: "Main", country: "JP", address1: null, city: null, state: null, zip: null });
    expect(foreign).toMatchObject({ country: "JP", address: "", city: "", state: "", zip: "" });
    const markup = html(createElement(ShipToView, { model: foreign }));
    expect(markup).toContain(">Japan<");
    expect(markup).not.toContain(">State<");
  });
});

it("a ship-to reads as one address line; missing parts drop out and a foreign one names its country", () => {
  expect(shipToAddress({ country: "US", address1: "1 Main St", address2: "Dock 2", city: "Phila", state: "PA", zip: "19107" })).toBe("1 Main St, Dock 2 · Phila, PA 19107");
  expect(shipToAddress({ country: "JP", address1: null, address2: null, city: null, state: null, zip: null })).toBe("Japan");
  expect(shipToAddress({ country: "NL", address1: null, address2: null, city: "Amsterdam", state: null, zip: "1011" })).toBe("Amsterdam 1011 · Netherlands");
});
