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
import { toShipToViewProps } from "../lib/mgr/ship-to-view";

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
    expect(src).toMatch(/<CustomerView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).toMatch(/detail=\{/);
    expect(src).not.toMatch(/readOnly/);
    expect(src).toMatch(/backHref: "\/customers"/);
  });

  it("a detail slot paints flds and ship-tos instead of the edit tree", () => {
    const markup = html(createElement(CustomerView, {
      model: toCustomerViewProps(customerRidgeline),
      detail: { shipTos: [{ key: "s1", title: "Main", detail: "dock" }], kegHref: "/kegs/x" },
    }));
    expect(markup).toMatch(/Type/);
    expect(markup).toMatch(/Retailer/);
    expect(markup).toMatch(/Main/);
    expect(markup).toMatch(/>Open</);
    expect(markup).not.toMatch(/>Save customer</);
    expect(markup).not.toMatch(/Customer name/);
  });
});

describe("Ship-to form", () => {
  it("maps a ship-to snapshot onto Main as default", () => {
    const model = toShipToViewProps(shipToMain);
    expect(model.title).toBe("Main ship-to");
    expect(model.city).toBe("Phoenixville");
    expect(model.isDefault).toBe(true);
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
