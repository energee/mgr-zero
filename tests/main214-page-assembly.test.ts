import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
const state = vi.hoisted(() => ({ role: "admin", calls: [] as string[] }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery", role: state.role }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ role: state.role }), isUuid: () => true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), notFound() { throw new Error("not found"); } }));
vi.mock("@/lib/commands/all", () => ({}));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => ({ busy: false, error: "", run() {} }), useCommandForm: () => ({ open: false, setOpen() {}, busy: false, error: "", submit() {} }) }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query }));
const brand = { id: "brand", name: "Hazy", abv: 6.8, description: "Juicy", category: "Core", price_group_id: "group", hops: "Citra", styles: { name: "IPA" }, skus: [{ id: "sku", name: "Hazy keg", format_id: "keg", active: false, upc: "123456" }] };
const customer = { id: "buyer", name: "Buyer", type: "retailer", state: "PA", sale_channel_id: "channel", license_no: "license", payment_terms: "Net 30", tax_treatment: "research", sale_channels: { name: "Wholesale" } };
const shipTo = { id: "ship", label: "Dock", address1: "1 Main", address2: null, city: "Town", state: "PA", zip: "12345", is_default: true };
async function query(name: string) {
  state.calls.push(name);
  switch (name) {
    case "list_brands": return [brand];
    case "list_formats": return [{ id: "keg", name: "Half keg", basis: "packaged", bbl_per_unit: ".5", brand_id: null }, { id: "pour", name: "Pint", basis: "poured", ounces: 16, brand_id: "brand", brands: { name: "Hazy" } }];
    case "list_price_groups": return [{ id: "group", name: "Core", position: 1, cost_ceiling_cents: null }];
    case "list_channel_prices": return [];
    case "list_sale_channels": return [{ id: "channel", name: "Wholesale", tax_treatment: "taxable" }];
    case "get_customer": return { customer, shipTos: [shipTo] };
    case "list_customers": return [customer];
    case "list_locations": return [{ id: "location", name: "Cold room", kind: "warehouse" }];
    case "list_bins": return [{ id: "bin", name: "Cold" }];
    case "get_bin_move_stock": return [{ skuId: "sku", qty: 4 }];
    default: throw new Error(name);
  }
}
import CatalogPage from "@/app/(app)/catalog/page";
import CustomersPage from "@/app/(app)/customers/page";
import CustomerPage from "@/app/(app)/customers/[id]/page";
import BinsPage from "@/app/(app)/locations/[id]/bins/page";
import { SCREENS } from "@/components/mgr/screens";
import PricingPage from "@/app/(app)/pricing/page";
import { CatalogView } from "@/components/mgr/views/catalog";
import { CustomersView } from "@/components/mgr/views/customers";
import { CustomerView } from "@/components/mgr/views/customer";
import { LocationBinsView } from "@/components/mgr/views/location-bins";
import { PriceGroupsView } from "@/components/mgr/views/price-groups";
beforeEach(() => { state.role = "admin"; state.calls = []; });
it("assembles shared Catalog with full brand, packaged SKU and per-brand pour controls", async () => {
  const page = await CatalogPage();
  expect(page.type).toBe(CatalogView);
  const html = renderToStaticMarkup(page);
  for (const text of ["Edit brand", "Edit SKU", "New pour", "Edit pour", "Inactive", "UPC 123456", "/catalog/formats/keg"]) expect(html).toContain(text);
  expect(html).not.toContain("/catalog/formats/pour");
});
it.each(["warehouse", "brewer"])("shared catalog and customers suppress denied controls for %s", async role => {
  state.role = role;
  const catalog = await CatalogPage();
  const customers = await CustomersPage();
  expect(catalog.type).toBe(CatalogView);
  expect(customers.type).toBe(CustomersView);
  expect(catalog.props.createAction).toBeNull();
  expect(customers.props.createAction).toBeNull();
  expect(renderToStaticMarkup(catalog)).not.toMatch(/Add brand|Edit brand|Add SKU|Edit SKU|Add pour|Edit pour|Add format/);
  expect(renderToStaticMarkup(customers)).not.toContain("Add customer");
});
it("customer view keeps tax edit prefill, default ship-to, filtered Orders and Invite", async () => {
  const page = await CustomerPage({ params: Promise.resolve({ id: "buyer" }) });
  expect(page.type).toBe(CustomerView);
  expect(page.props.headerAction.props.customer.taxTreatment).toBe("research");
  expect(page.props.detail.shipTos[0].action.props.shipTo.is_default).toBe(true);
  const html = renderToStaticMarkup(page);
  for (const text of ["Tax treatment", "research", "Dock · default", "/orders?customerId=buyer", "Invite portal user"]) expect(html).toContain(text);
  state.role = "warehouse";
  const readonly = renderToStaticMarkup(await CustomerPage({ params: Promise.resolve({ id: "buyer" }) }));
  expect(readonly).not.toMatch(/Edit customer|Add ship-to|Edit ship-to|Invite portal user|invitations aren/);
  expect(readonly).toContain("research");
});
it("bins shared view retains actual stock move inputs and suppresses Warehouse-only queries for sales", async () => {
  const page = await BinsPage({ params: Promise.resolve({ id: "location" }) });
  expect(page.type).toBe(LocationBinsView);
  expect(page.props.footer.props.stock).toEqual([{ skuId: "sku", qty: 4 }]);
  expect(page.props.footer.props.bins[0].id).toBe("bin");
  state.role = "sales"; state.calls = [];
  const readonly = await BinsPage({ params: Promise.resolve({ id: "location" }) });
  expect(state.calls).not.toContain("get_bin_move_stock");
  expect(renderToStaticMarkup(readonly)).not.toMatch(/Add bin|Edit bin|Move stock/);
});
it("pricing shared tables retain brand-qualified poured columns", async () => {
  const page = await PricingPage();
  expect(page.type).toBe(PriceGroupsView);
  expect(renderToStaticMarkup(page)).toContain("Hazy · Pint");
});
it("explicit null suppresses new shared view fixture actions", async () => {
  const catalog = await CatalogPage();
  const customers = await CustomersPage();
  expect(renderToStaticMarkup(createElement(CatalogView, { model: catalog.props.model, createAction: null }))).not.toContain("Add brand");
  expect(renderToStaticMarkup(createElement(CustomersView, { model: customers.props.model, createAction: null }))).not.toContain("Add customer");
});

it("converted inventory frames never navigate into the live catalog/customer/location/settings pages", () => {
  const names = ["Catalog", "Customers", "Customer detail", "Locations", "Location detail", "Location bins", "SKU", "SKU list", "Formats", "Format", "Package BOM", "Price groups", "Price group", "Sale channels", "Channel", "Units"];
  for (const name of names) {
    const screen = SCREENS.find(s => s.name === name)!;
    expect(screen, name).toBeDefined();
    const html = renderToStaticMarkup(createElement("div", null, screen.body));
    expect(html, name).not.toMatch(/href="\//);
  }
});
