// tests/customers-view.test.ts — Customers list, Customer detail, and
// Ship-to form share adapters with list_customers / get_customer snapshots.
import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { CustomerView } from "../components/mgr/views/customer";
import { CustomersView } from "../components/mgr/views/customers";
import { ListControls } from "../components/mgr/list-controls";
import { ShipToView } from "../components/mgr/views/ship-to";
import { customerRidgeline, customersList, shipToMain } from "../lib/mgr/fixtures/customers";
import { ALS, RIDGELINE } from "../lib/mgr/fixtures/demo";
import { CUSTOMER_ALIAS_HELP, toCustomerViewProps } from "../lib/mgr/customer-view";
import { CUSTOMER_TYPES } from "../lib/mgr/enums";
import { CUSTOMER_TYPE_OPTIONS } from "../lib/mgr/labels";
import { toCustomersViewProps } from "../lib/mgr/customers-view";
import { shipToAddress, shipToFormFields, toShipToViewProps } from "../lib/mgr/ship-to-view";

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Customers list", () => {
  it("maps list_customers through portal-user and remit copy", () => {
    const model = toCustomersViewProps(customersList);
    expect(model.rows.map((r) => r.title)).toEqual([RIDGELINE.name, ALS.name]);
    expect(model.rows[0]?.detail).toBe("Retailer · PA · 2 portal users");
    expect(model.rows[1]?.detail).toBe("Retailer · OH · brewery remits");
    expect(model.rows[1]?.warning).toBe(true);
  });

  it("the Customers inventory record is CustomersView", () => {
    const body = screen("Customers").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Customers").body)).toBe(true);
    expect(body.type).toBe(CustomersView);
    expect(body.props.model).toEqual(toCustomersViewProps(customersList));
  });

  // #994: both Customers records draw live's search strip, as Recipes, Vendors and Materials do.
  it.each(["Customers", "Customers missing email"])("the %s inventory record passes ListControls as its search", (name) => {
    const body = screen(name).body as { props: { search?: { type: unknown; props: { search: { label: string } } } } };
    expect(body.props.search?.type).toBe(ListControls);
    expect(body.props.search?.props.search.label).toBe("Search customers");
  });

  it("the inventory list offers New customer, as live does, and each row opens by its arrow, not an Open verb (#996, #1026)", () => {
    const markup = html(screen("Customers").body);
    expect(markup).toMatch(/>New customer</);
    expect(readFileSync("app/(app)/customers/customer-form.tsx", "utf8")).toContain('"New customer"');
    expect(markup).not.toMatch(/>Open</);
    const first = toCustomersViewProps(customersList).rows[0]!.title;
    expect(markup.split('data-slot="item"').find(item => item.includes(first))).toContain('aria-label="Open"');
  });

  it("a live customer row is one link to its detail page (#996)", () => {
    const model = toCustomersViewProps(customersList);
    const markup = html(createElement(CustomersView, { model, linkRows: true, createAction: null, search: null }));
    expect(markup).toContain(`href="${model.rows[0]!.href}"`);
    expect(markup).not.toMatch(/>Open</);
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
  it.each(["", "   ", "\t\n", "\u00a0\u2003"])("holds Save and marks an empty customer name %j", name => {
    const model = toCustomerViewProps(customerRidgeline);
    model.editValues.name = name;
    const markup = html(createElement(CustomerView, { model }));
    expect(markup).toContain("Name required");
    expect(markup.match(/<input[^>]*aria-label="Customer name"[^>]*>/)?.[0]).toContain('aria-invalid="true"');
    expect(markup.match(/<button[^>]*>Save customer<\/button>/)?.[0]).toContain('disabled=""');
  });

  it("keeps padded and 250-character customer names available to save without a name cap", () => {
    for (const name of [" \tValid account\n ", "N".repeat(250)]) {
      const model = toCustomerViewProps(customerRidgeline);
      model.editValues.name = name;
      const markup = html(createElement(CustomerView, { model }));
      expect(markup.match(/<button[^>]*>Save customer<\/button>/)?.[0]).not.toContain('disabled=""');
      expect(markup.match(/<input[^>]*aria-label="Customer name"[^>]*>/)?.[0]).not.toContain("maxLength");
    }
  });

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
    // The keg balance row only navigates: one row link, not an Open verb (#1026).
    expect(markup).toMatch(/<a[^>]*href="\/kegs\/x"[^>]*>[\s\S]*?Customer keg balance/);
    expect(markup).not.toMatch(/>Open</);
    expect(markup).not.toContain("New order"); // a live viewer who may not create orders
    expect(html(createElement(CustomerView, { model: toCustomerViewProps(customerRidgeline), detail: { newOrderHref: "/orders/new?customerId=c" } })))
      .toMatch(/<a[^>]*href="\/orders\/new\?customerId=c"[^>]*>[\s\S]*?New order/);
    expect(markup).toMatch(/>Save customer</);
    expect(markup).toMatch(/Customer name/);
  });
});

describe("Ship-to form", () => {
  it("maps a ship-to snapshot onto Main as default", () => {
    const model = toShipToViewProps(shipToMain);
    expect(model.label).toBe("Main");
    expect(model.city).toBe("Phoenixville");
    expect(model.isDefault).toBe(true);
    expect(toShipToViewProps({ ...shipToMain, address2: "Dock 2" }).address2).toBe("Dock 2");
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

// #994: an empty search is not an empty customer book.
it("says no customers match, not no customers yet, when a search is on", () => {
  expect(toCustomersViewProps({ customers: [], filtered: true }).empty).toEqual({ title: "No customers match", description: "Clear the search to see every customer." });
  expect(toCustomersViewProps({ customers: [], missingPortalEmail: true, filtered: true }).empty?.title).toBe("No customers match");
  expect(toCustomersViewProps({ customers: [] }).empty?.title).toBe("No customers yet");
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
  const jp = { ...customerRidgeline, customer: { ...customerRidgeline.customer, name: "Maple Imports", country: "JP", state: null, alias: "Tokyo" } };

  it("the list titles a customer with its alias and reads its country when it is not the US", () => {
    const model = toCustomersViewProps({ customers: [
      { ...customersList.customers[0], alias: "Evergreen" },
      { ...customersList.customers[1], country: "JP", state: null },
    ] });
    expect(model.rows[0]?.title).toBe(`${RIDGELINE.name} · Evergreen`);
    expect(model.rows[0]?.detail).toBe("Retailer · PA · 2 portal users");
    expect(model.rows[1]?.detail).toBe("Retailer · Japan · brewery remits");
  });

  it("customer detail keeps State in place, required only for a US customer (#1306)", () => {
    const us = toCustomerViewProps(customerRidgeline);
    expect(us.editValues).toMatchObject({ country: "US", state: "PA", alias: "" });
    const usMarkup = html(createElement(CustomerView, { model: us }));
    expect(usMarkup).toContain(">Country<");
    expect(usMarkup).toContain(">United States<");
    expect(usMarkup).toContain(">State (required)<");
    const usState = usMarkup.match(/<button[^>]*aria-label="State \(required\)"[^>]*>/)?.[0];
    expect(usState).toContain('aria-required="true"');
    expect(usState).not.toContain('disabled=""');
    // The alias says what it is in a note that stays while typing, not a placeholder (#1131).
    expect(usMarkup).not.toContain('placeholder="Staff only"');
    const aliasHelp = usMarkup.match(/<input[^>]*aria-describedby="([^"]+-alias-help)"/)?.[1];
    expect(aliasHelp).toBeDefined();
    expect(usMarkup).toContain(`id="${aliasHelp}"`);
    expect(usMarkup).toContain(CUSTOMER_ALIAS_HELP);
    const foreign = toCustomerViewProps(jp);
    expect(foreign.editValues).toMatchObject({ country: "JP", state: "", alias: "Tokyo" });
    const jpMarkup = html(createElement(CustomerView, { model: foreign }));
    expect(jpMarkup).toContain(">Japan<");
    expect(jpMarkup).toContain(">State<");
    const jpState = jpMarkup.match(/<input[^>]*aria-label="State"[^>]*>/)?.[0];
    expect(jpState).toContain('disabled=""');
    expect(jpState).toContain('value="Not applicable"');
    expect(jpState).not.toContain('required=""');
  });

  it("offers each customer type once, in sentence case, on both customer forms (#1131)", () => {
    expect(CUSTOMER_TYPE_OPTIONS).toEqual([
      { value: "distributor", label: "Distributor" }, { value: "retailer", label: "Retailer" },
      { value: "brewery", label: "Brewery" }, { value: "other", label: "Other" },
    ]);
    expect(new Set(CUSTOMER_TYPES).size).toBe(CUSTOMER_TYPES.length);
    expect(readFileSync("components/mgr/views/customer.tsx", "utf8")).toContain("CUSTOMER_TYPE_OPTIONS");
    const form = readFileSync("app/(app)/customers/customer-form.tsx", "utf8");
    expect(form).not.toContain("@/components/ui/select");
    expect(form).toContain("CUSTOMER_TYPE_OPTIONS");
  });

  it("explains the channel abbreviation and separates export pricing from export tax (#1261)", () => {
    const model = toCustomerViewProps(customerRidgeline);
    model.editValues.saleChannelId = model.channelOptions.find(channel => channel.name === "DTC")!.id;
    const markup = html(createElement(CustomerView, { model }));
    expect(markup).toContain("Direct to consumer (DTC)");
    expect(markup).toMatch(/sale channel sets prices and the default tax treatment/);
    expect(markup).toMatch(/Export channel does not override a customer’s tax treatment/);
    expect(markup).toMatch(/Export tax treatment means shipment outside the US without payment of tax/);
  });

  it("the New customer dialog explains the alias and says where ship-tos are added (#1131)", () => {
    const form = readFileSync("app/(app)/customers/customer-form.tsx", "utf8");
    expect(form).not.toContain("Staff only");
    expect(form).toContain("{CUSTOMER_ALIAS_HELP}");
    // Create only: an existing customer already has a page to add ship-tos on.
    expect(form).toContain('!isEdit && E.info("Add ship-to addresses on the customer’s page after you create the customer.")');
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

it("a new ship-to starts in the customer's country; an edited one keeps its own", () => {
  expect(shipToFormFields(undefined, "JP")).toEqual({ label: "", country: "JP", address1: "", address2: "", city: "", state: "", zip: "", isDefault: false });
  expect(shipToFormFields(undefined, "US").country).toBe("US");
  const edited = { label: "Dock", country: "US", address1: "1 Main St", address2: null, city: "Phila", state: "PA", zip: "19107", is_default: true };
  expect(shipToFormFields(edited, "JP")).toEqual({ label: "Dock", country: "US", address1: "1 Main St", address2: "", city: "Phila", state: "PA", zip: "19107", isDefault: true });
});

it("a ship-to reads as one address line; missing parts drop out and a foreign one names its country", () => {
  expect(shipToAddress({ country: "US", address1: "1 Main St", address2: "Dock 2", city: "Phila", state: "PA", zip: "19107" })).toBe("1 Main St, Dock 2 · Phila, PA 19107");
  expect(shipToAddress({ country: "JP", address1: null, address2: null, city: null, state: null, zip: null })).toBe("Japan");
  expect(shipToAddress({ country: "NL", address1: null, address2: null, city: "Amsterdam", state: null, zip: "1011" })).toBe("Amsterdam 1011 · Netherlands");
  // The short form (city and state only) the order, portal and delivery screens use.
  expect(shipToAddress({ country: "US", city: "Columbus", state: "OH" })).toBe("Columbus, OH");
  expect(shipToAddress({ country: "JP", city: null, state: null })).toBe("Japan");
});
