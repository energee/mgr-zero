import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { BreweryProvider } from "@/lib/brewery-provider";
// These pages live under app/(app), whose layout mounts BreweryProvider; the
// tests render the page subtree on its own, so they supply it here.
const render = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(createElement(BreweryProvider, { id: "brewery", actorId: "actor" }, node));
const state = vi.hoisted(() => ({ roles: ["admin"], calls: [] as string[], customerInput: {} as Record<string, unknown>, brandInput: {} as Record<string, unknown>, inputs: {} as Record<string, unknown> }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery", roles: state.roles }) }));
// The real command registry loads (the pages import @/lib/commands/all), so canRun
// answers each role the way it does live.
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ breweryId: "brewery", roles: state.roles }), isUuid: () => true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), notFound() { throw new Error("not found"); } }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => ({ busy: false, error: "", fieldErrors: {}, run() {} }), useCommandForm: () => ({ open: false, setOpen() {}, busy: false, error: "", fieldErrors: {}, submit() {} }) }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query }));
const brand = { id: "brand", name: "Hazy", abv: 6.8, description: "Juicy", category: "Core", price_group_id: "group", hops: "Citra", styles: { name: "IPA" }, skus: [{ id: "sku", name: "Hazy keg", format_id: "keg", active: false, upc: "123456" }] };
const customer = { id: "buyer", name: "Buyer", type: "retailer", state: "PA", sale_channel_id: "channel", license_no: "license", payment_terms: "net30", tax_treatment: "research", sale_channels: { name: "Wholesale" } };
const shipTo = { id: "ship", label: "Dock", address1: "1 Main", address2: null, city: "Town", state: "PA", zip: "12345", is_default: true };
async function query(name: string, input?: { basis?: string; missingPortalEmail?: boolean }) {
  state.calls.push(name);
  switch (name) {
    case "list_brands": state.brandInput = input ?? {}; return [{ ...brand, colas: [] }];
    case "list_catalog_categories": return [{ name: "Core" }, { name: "Barrel & Wood" }];
    case "list_skus": return brand.skus.map(sku => ({ ...sku, brand_id: brand.id, formats: { name: "Half keg", bbl_per_unit: ".5" } }));
    case "list_formats": return [{ id: "keg", name: "Half keg", basis: "packaged", bbl_per_unit: ".5", brand_id: null }, { id: "pour", name: "Pint", basis: "poured", ounces: 16, brand_id: null, price_group_id: "group", price_groups: { name: "Core" } }].filter(f => !input?.basis || f.basis === input.basis);
    case "list_keg_pools": return [];
    case "list_price_groups": return [{ id: "group", name: "Core", position: 1, cost_ceiling_cents: null }];
    case "list_channel_prices": return [];
    case "list_price_group_barcodes": return [];
    case "list_sale_channels": return [{ id: "channel", name: "Wholesale", tax_treatment: "taxable" }];
    case "get_customer": return { customer, shipTos: [shipTo, { ...shipTo, id: "back", label: "Back door", is_default: false }] };
    case "list_customer_users": return [{ userId: "user", email: "jo@buyer.test", createdAt: "2026-09-01T00:00:00Z" }];
    // One unpaid pushed invoice with a QuickBooks balance: Open balance reads $250.00 (#1585).
    case "list_invoices": return { rows: [{ id: "inv", kind: "invoice", qbo_invoice_id: "qbo", paid_at: null, qbo_balance_cents: 25000, has_pending_qbo_push: false, was_pushed_to_qbo: true, local_paid_cents: 0, local_credit_cents: 0, total_cents: 25000 }], nextCursor: null };
    case "list_customers": state.customerInput = input ?? {}; return [customer];
    case "list_locations": return [{ id: "location", name: "Cold room", uses: ["warehouse"] }];
    case "list_bins": return [{ id: "bin", name: "Cold" }];
    case "get_bin_move_stock": return [{ bin_id: "bin", skuId: "sku", qty: 4 }];
    // #994: the searched lists record their input and find nothing, so the no-match copy shows.
    case "list_recipes": case "list_vendors_and_contracts": case "list_materials": state.inputs[name] = input; return [];
    case "list_packaging_runs": case "list_occupancies": case "list_repack_parents": return [];
    case "list_vendors": case "get_material_on_hand": return [];
    case "list_routes": return { routes: [
      { id: "planned", name: "North loop", delivery_date: "2026-09-11", driver_user_id: "driver-1", driver_email: "sam@example.test", vehicle: null, note: null, departed_at: null, returned_at: null, stops: [] },
      { id: "gone", name: "Hill route", delivery_date: "2026-09-10", driver_user_id: "driver-1", driver_email: "sam@example.test", vehicle: null, note: null, departed_at: "2026-09-10T14:00:00Z", returned_at: null, stops: [{ id: "s1", stop_no: 1, delivered_at: null }] },
      { id: "done", name: "Mill route", delivery_date: "2026-09-09", driver_user_id: "driver-1", driver_email: "sam@example.test", vehicle: null, note: null, departed_at: "2026-09-09T14:00:00Z", returned_at: null, stops: [{ id: "s2", stop_no: 1, delivered_at: "2026-09-09T15:00:00Z" }] },
      { id: "nobody", name: "River run", delivery_date: "2026-09-12", driver_user_id: null, driver_email: null, vehicle: null, note: null, departed_at: null, returned_at: null, stops: [] },
      { id: "former", name: "Lake loop", delivery_date: "2026-09-13", driver_user_id: "driver-2", driver_email: null, vehicle: null, note: null, departed_at: null, returned_at: null, stops: [] },
    ], anyReturned: false, unassigned: [], drivers: [], today: "2026-09-10" };
    default: throw new Error(name);
  }
}
import CatalogPage from "@/app/(app)/catalog/page";
import SkuListPage from "@/app/(app)/catalog/brands/[id]/skus/page";
import CustomersPage from "@/app/(app)/customers/page";
import CustomerPage from "@/app/(app)/customers/[id]/page";
import LocationPage from "@/app/(app)/locations/[id]/page";
import { SCREENS } from "@/components/mgr/screens";
import PricingPage from "@/app/(app)/pricing/page";
import RoutesPage from "@/app/(app)/routes/page";
import RecipesPage from "@/app/(app)/recipes/page";
import VendorsPage from "@/app/(app)/vendors/page";
import MaterialsPage from "@/app/(app)/materials/page";
import { CatalogView } from "@/components/mgr/views/catalog";
import { canRun } from "@/lib/commands/registry";
import { STAFF_ROLES } from "@/lib/mgr/enums";
import { SkuListView } from "@/components/mgr/views/sku-list";
import { CustomersView } from "@/components/mgr/views/customers";
import { CustomerDetailForm } from "@/app/(app)/customers/customer-detail-form";
import { LocationBinsView } from "@/components/mgr/views/location-bins";
import { PriceGroupsView } from "@/components/mgr/views/price-groups";
import PackagingPage from "@/app/(app)/packaging/page";
import { ScheduleRunForm } from "@/app/(app)/packaging/schedule-run-form";
import { SchedulePackagingRunView } from "@/components/mgr/views/schedule-packaging-run";
import { toSchedulePackagingRunView } from "@/lib/mgr/schedule-packaging-run-view";
beforeEach(() => { state.roles = ["admin"]; state.calls = []; });
it("assembles shared Catalog with the brand link and the shared format list", async () => {
  const page = await CatalogPage();
  expect(page.type).toBe(CatalogView);
  expect(state.brandInput).toEqual({ q: "", sort: "name", category: "" });
  const html = render(page);
  // Packages and pours are one tap further, on the brand's SKU list.
  for (const text of ["/catalog/brands/brand", "/catalog/formats/keg"]) expect(html).toContain(text);
  for (const text of ["Edit brand", "Edit SKU", "UPC 123456", "New pour", "Edit pour"]) expect(html).not.toContain(text);
  expect(html).not.toContain("/catalog/formats/pour");
});
it.each([
  ["admin", true], ["sales", true], ["brewer", false], ["warehouse", false],
] as const)("Schedule run gives %s a brand creation link only with permission (#1256)", async (role, canCreate) => {
  state.roles = [role];
  const page = await PackagingPage({ searchParams: Promise.resolve({}) });
  const form = page.props.actions.props.children[0];
  expect(form.type).toBe(ScheduleRunForm);
  expect(form.props.catalogHref).toBe(canCreate ? "/catalog" : null);
  const model = toSchedulePackagingRunView({ brands: [], occupancies: [], skus: [] }, { brandId: "", occupancyId: "", plannedOn: "", qty: {} });
  const markup = render(createElement(SchedulePackagingRunView, { model, catalogHref: form.props.catalogHref }));
  expect(markup.includes('href="/catalog"')).toBe(canCreate);
  if (!canCreate) expect(markup).toContain("An admin or sales member can add a brand in Catalog.");
});
// #1062: Catalog links a brand, Price groups and Water profiles only for a role
// that page lets in (upsert_brand, the /pricing reads, list_water_profiles).
it.each([
  ["admin", ["/catalog/brands/brand", "/pricing", "/catalog/water-profiles"], []],
  ["sales", ["/catalog/brands/brand", "/pricing"], ["/catalog/water-profiles"]],
  ["warehouse", [], ["/catalog/brands/", "/pricing", "/catalog/water-profiles"]],
])("Catalog links for %s only the pages that role may open", async (role, linked, inert) => {
  state.roles = [role];
  const html = render(await CatalogPage());
  for (const href of linked) expect(html).toContain(`href="${href}"`);
  for (const href of inert) expect(html).not.toContain(`href="${href}`);
  // The rows still draw for every role; one without its link is plain, not a dead tap.
  for (const text of [">Hazy<", "Price groups", "Water profiles"]) expect(html).toContain(text);
  if (role === "warehouse") expect(html).not.toMatch(/\sdata-tap[\s>=]/);
  // Every role that reaches Catalog may open a format.
  expect(html).toContain('href="/catalog/formats/keg"');
});
// #1062: the Price groups gate is the reads /pricing runs, so the two cannot drift
// apart. The real registry answers canRun for each staff role.
it.each(STAFF_ROLES)("Catalog links Price groups for %s exactly when it may run every /pricing read", async (role) => {
  state.roles = [role];
  await PricingPage();
  const reads = [...new Set(state.calls)];
  expect(reads).toContain("list_channel_prices");
  const ctx = { breweryId: "brewery", roles: [role] } as unknown as Parameters<typeof canRun>[0];
  const html = render(await CatalogPage());
  expect(html.includes('href="/pricing"')).toBe(reads.every(name => canRun(ctx, name)));
});
it("assembles the shared SKU list with the brand's packages and the edit sheet, but no New SKU", async () => {
  const page = await SkuListPage({ params: Promise.resolve({ id: "brand" }) });
  expect(page.type).toBe(SkuListView);
  const html = render(page);
  for (const text of ["Hazy · SKUs", "Half keg", "inactive", "Edit SKU"]) expect(html).toContain(text);
  expect(html).not.toMatch(/New SKU|Add SKU/);
  state.roles = ["warehouse"];
  const readonly = render(await SkuListPage({ params: Promise.resolve({ id: "brand" }) }));
  expect(readonly).not.toMatch(/New SKU|Edit SKU|Add SKU/);
  expect(readonly).toContain("Half keg");
});
it.each(["warehouse", "brewer"])("shared catalog and customers suppress denied controls for %s", async role => {
  state.roles = [role];
  const catalog = await CatalogPage();
  const customers = await CustomersPage();
  expect(catalog.type).toBe(CatalogView);
  expect(customers.type).toBe(CustomersView);
  expect(catalog.props.createAction).toBeNull();
  expect(customers.props.createAction).toBeNull();
  expect(render(catalog)).not.toMatch(/New brand|Edit brand|Add SKU|Edit SKU|Add pour|Edit pour|Add format/);
  expect(render(customers)).not.toContain("New customer");
});
it("customer view keeps tax edit prefill, default ship-to, filtered Orders, Invite and Remove access", async () => {
  const page = await CustomerPage({ params: Promise.resolve({ id: "buyer" }) });
  expect(page.type).toBe(CustomerDetailForm);
  expect(page.props.model.editValues.taxTreatment).toBe("research");
  expect(page.props.detail.shipTos[0].action.props.shipTo.is_default).toBe(true);
  // Only a non-default ship-to offers Delete: the default goes once another is the default (#1487).
  expect(page.props.detail.shipTos[0].remove).toBeNull();
  expect(page.props.detail.shipTos[1].remove.props).toMatchObject({ command: "delete_ship_to", input: { shipToId: "back" }, redirect: "/customers/buyer" });
  expect(page.props.detail.revokePortalUser.user.props).toMatchObject({ command: "revoke_customer_user", input: { customerId: "buyer", userId: "user" } });
  const html = render(page);
  for (const text of ["Tax treatment", "Research", "Dock · default", "/orders?customerId=buyer", "/orders/new?customerId=buyer", "Invite portal user", "jo@buyer.test", "Remove access", "Delete ship-to", "$250.00 · 1 unpaid invoice", "/invoices?customerId=buyer&amp;status=unpaid"]) expect(html).toContain(text);
  state.roles = ["warehouse"]; state.calls = [];
  const readonly = render(await CustomerPage({ params: Promise.resolve({ id: "buyer" }) }));
  expect(state.calls).not.toContain("list_customer_users");
  expect(state.calls).not.toContain("list_invoices");
  expect(readonly).not.toMatch(/Open balance|Edit customer|Add ship-to|Edit ship-to|Delete ship-to|Invite portal user|invitations aren|Portal users|Remove access/);
  expect(readonly).toContain("Research");
  expect(readonly).not.toContain("/orders/new");
});
it("Location detail's Bins section retains actual stock move inputs and suppresses Warehouse-only queries for sales (#1507)", async () => {
  const page = await LocationPage({ params: Promise.resolve({ id: "location" }) });
  const bins = page.props.bins;
  expect(bins.type).toBe(LocationBinsView);
  expect(bins.props.footer.props.stock).toEqual([{ bin_id: "bin", skuId: "sku", qty: 4 }]);
  expect(bins.props.footer.props.bins[0].id).toBe("bin");
  // #1154: the page names the location and the row says what the bin holds.
  expect(render(page)).toMatch(/Cold room[\s\S]*Bins[\s\S]*Cold[\s\S]*1 kind of stock/);
  state.roles = ["sales"]; state.calls = [];
  const readonly = await LocationPage({ params: Promise.resolve({ id: "location" }) });
  expect(state.calls).not.toContain("get_bin_move_stock");
  // Sales never reads bin stock, so the row claims neither a count nor Empty.
  expect(render(readonly)).not.toMatch(/Add bin|Edit bin|Move stock|of stock|Empty|Nothing is stored/);
});
it("pricing shared tables draw a group's pour as a column by its name, with a cell on that group", async () => {
  const page = await PricingPage();
  expect(page.type).toBe(PriceGroupsView);
  const html = render(page);
  expect(html).toMatch(/>Pour · Pint<\/th>/);
  expect(html.match(/placeholder="—"/g)).toHaveLength(2);
});
it("explicit null suppresses new shared view fixture actions", async () => {
  const catalog = await CatalogPage();
  const customers = await CustomersPage();
  expect(render(createElement(CatalogView, { model: catalog.props.model, createAction: null }))).not.toContain("New brand");
  expect(render(createElement(CustomersView, { model: customers.props.model, createAction: null }))).not.toContain("New customer");
});

it("converted inventory frames never navigate into the live catalog/customer/location/settings pages", () => {
  const names = ["Catalog", "Customers", "Customer detail", "Locations", "Location detail", "SKU", "SKU list", "Formats", "Format", "Package BOM", "Price groups", "Price group", "Sale channels", "Channel"];
  for (const name of names) {
    const screen = SCREENS.find(s => s.name === name)!;
    expect(screen, name).toBeDefined();
    const html = render(createElement("div", null, screen.body));
    expect(html, name).not.toMatch(/href="\//);
  }
});

it("asks the registered customer query for the missing-email subset", async () => {
  const page = await CustomersPage({ searchParams: Promise.resolve({ missingEmail: "1" }) });
  expect(state.customerInput).toEqual({ missingPortalEmail: true, q: "" });
  expect(page.type).toBe(CustomersView);
  expect(page.props.model.missingPortalEmail).toBe(true);
});

// #994: Customers, Recipes, Vendors and Materials on hand pass ?q= to their list query, as Catalog does.
it("passes the Customers search to list_customers and keeps ?missingEmail in the form", async () => {
  const html = render(await CustomersPage({ searchParams: Promise.resolve({ q: " buy ", missingEmail: "1" }) }));
  expect(state.customerInput).toEqual({ missingPortalEmail: true, q: "buy" });
  expect(html).toContain('value="buy"');
  expect(html).toContain('name="missingEmail" value="1"');
});
it.each([
  ["list_recipes", RecipesPage, { q: "west" }, "No recipes match"],
  ["list_vendors_and_contracts", VendorsPage, { q: "west" }, "No vendors match"],
  ["list_materials", MaterialsPage, { includeInactive: true, q: "west" }, "No materials match"],
] as const)("passes the search to %s and says nothing matches", async (name, Page, input, empty) => {
  const html = render(await Page({ searchParams: Promise.resolve({ q: " west " }) }));
  expect(state.inputs[name]).toEqual(input);
  expect(html).toContain('value="west"');
  expect(html).toContain(empty);
});

it.each([
  { roles: ["admin"], mayOrder: true },
  { roles: ["warehouse"], mayOrder: true },
  { roles: ["brewer"], mayOrder: false },
  { roles: ["brewer", "warehouse"], mayOrder: true },
])("Materials empty recovery respects the actual page permissions for $roles", async ({ roles, mayOrder }) => {
  state.roles = roles;
  const page = await MaterialsPage({ searchParams: Promise.resolve({}) });
  const html = render(page);
  expect(html).toContain("No materials yet");
  expect(html).toContain("Add material");
  expect(html.includes('href="/purchase-orders"')).toBe(mayOrder);
  expect(page.props.model.purchaseOrdersHref).toBe(mayOrder ? "/purchase-orders" : null);
  const filtered = render(await MaterialsPage({ searchParams: Promise.resolve({ q: "missing" }) }));
  expect(filtered).toContain("No materials match");
  expect(filtered).not.toContain('href="/purchase-orders"');
});
// #1021 review: a search with text offers a way back to the whole list, keeping the other params.
it("offers Clear search while a search is on, and keeps the other params", async () => {
  const html = render(await CustomersPage({ searchParams: Promise.resolve({ q: "buy", missingEmail: "1" }) }));
  expect(html).toMatch(/href="\?missingEmail=1"[^>]*>Clear search</);
  expect(render(await CustomersPage({ searchParams: Promise.resolve({}) }))).not.toContain("Clear search");
});
// #1021 review: a list with no records and no search has nothing to search.
it.each([["Recipes", RecipesPage], ["Vendors", VendorsPage], ["Materials", MaterialsPage]] as const)("%s draws no search box while the list is empty and unsearched", async (_, Page) => {
  expect(render(await Page({ searchParams: Promise.resolve({}) }))).not.toContain('role="search"');
});
it("says no contracts match when a vendor search finds none", async () => {
  const html = render(await VendorsPage({ searchParams: Promise.resolve({ q: "west" }) }));
  expect(html).toContain("No contracts match");
  expect(html).not.toContain("No contracts yet");
});

// docs/plans/list-filters.md: the URL's search, sort and category reach list_brands; a bad sort falls back.
it("passes Catalog's URL filters to list_brands", async () => {
  const page = await CatalogPage({ searchParams: Promise.resolve({ q: " hazy ", sort: "bogus", category: "Core" }) });
  expect(state.brandInput).toEqual({ q: "hazy", sort: "name", category: "Core" });
  const html = render(page);
  expect(html).toContain('value="hazy"');
  // Sort and Category are ScopePick selects (#965): each option carries the
  // link that changes only that setting, keeping the search and the other one.
  const scopes = page.props.controls.props.scopes as { label: string; options: { value: string; href?: string }[] }[];
  const href = (label: string, value: string) => scopes.find((s) => s.label === label)?.options.find((o) => o.value === value)?.href;
  expect(href("Sort", "abv")).toBe("/catalog?q=hazy&sort=abv&category=Core");
  expect(href("Category", "")).toBe("/catalog?q=hazy");
});
it("routes list: an assigned route not yet departed is a row link; Resume and Assign stay verbs (#1026)", async () => {
  const html = render(await RoutesPage({ searchParams: Promise.resolve({}) }));
  expect(html).toMatch(/<a[^>]*href="\/routes\/planned"[^>]*>(?:(?!<\/a>)[\s\S])*North loop · Sep 11, 2026/);
  expect(html).toMatch(/<a[^>]*href="\/routes\/gone"[^>]*>Resume<\/a>/);
  expect(html).toMatch(/<a[^>]*href="\/routes\/nobody"[^>]*>Assign<\/a>/);
  // Every stop has an outcome: Return opens the route, where the driver records the truck back (#1505).
  expect(html).toMatch(/<a[^>]*href="\/routes\/done"[^>]*>Return<\/a>/);
  // "Open" is the Status pick's value; the route row itself has no Open verb.
  expect(html).not.toMatch(/<(?:a|button)\b[^>]*>Open<\/(?:a|button)>/);
});
it("routes list: a planned route names its driver by roster email, or says the driver left the team (#1124)", async () => {
  const html = render(await RoutesPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("0 stops · sam@example.test");
  expect(html).toContain("0 stops · driver not on the team");
  expect(html).not.toMatch(/driver driver-/);
});
it("encodes a Catalog category with a space and an ampersand in its scope link", async () => {
  const page = await CatalogPage({ searchParams: Promise.resolve({ q: "hazy", sort: "abv" }) });
  const scopes = page.props.controls.props.scopes as { label: string; options: { value: string; href?: string }[] }[];
  const category = scopes.find((s) => s.label === "Category")?.options.find((o) => o.value === "Barrel & Wood");
  expect(category?.href).toBe("/catalog?q=hazy&sort=abv&category=Barrel+%26+Wood");
});
