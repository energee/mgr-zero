// Execute the real page and metadata declarations at their authorized read boundary.
// Next resolves not-found metadata only when metadata itself rejects the missing record.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { CommandError } from "@/lib/commands/registry";
import { isUuid } from "@/lib/commands/context";
import { orNotFound } from "@/lib/mgr/not-found";
import { navTitle } from "@/lib/mgr/nav";
import { periodLabel, periodRange } from "@/lib/compliance-period";
import { recipePageTitle } from "@/lib/mgr/recipe-view";
import { noMembershipModel, portalStaffOnlyModel } from "@/lib/mgr/entry-view";
import { historyPage, pageCursor } from "@/lib/mgr/history-page";

const ROOT = join(__dirname, "..");
const MISSING = "afffffff-ffff-4fff-8fff-ffffffffffff";
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const require = createRequire(join(ROOT, "package.json"));
type Render = (props: { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }) => Promise<unknown>;
type PageModule = { default: Render; generateMetadata: Render; metadata?: { title: string } };

/** Compile actual declarations; omit imports so reads use the explicit test boundary, not a database. */
function loadPage(file: string, bindings: Record<string, unknown>): PageModule & Record<string, unknown> {
  const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = source.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => node.getText(source)).join("\n");
  const { outputText } = ts.transpileModule(declarations, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {} as PageModule & Record<string, unknown>;
  new Function("exports", "require", ...Object.keys(bindings), outputText)(exports, require, ...Object.values(bindings));
  return exports;
}


function requestBindings() {
  const calls: string[] = [];
  const query = async (name: string) => {
    calls.push(name);
    if (name === "list_routes") return { routes: [] };
    if (name === "get_compliance_registry") return { brands: [] };
    if (name === "get_gravity_unit") return { effective: "plato" };
    if (name === "list_movements") return { rows: [], nextCursor: null };
    if (name === "portal_catalog") return [];
    if (name === "get_portal_account") return { shipTos: [], membership: { userId: "actor" }, fulfillmentSource: null };
    if (name.startsWith("list_")) return [];
    throw new CommandError("record not found", 404, "not_found");
  };
  const ctx = { roles: ["admin"], userId: "actor", breweryId: "brewery" };
  const bindings: Record<string, unknown> = {
    cache, notFound, redirect, orNotFound, isUuid, navTitle, periodLabel, periodRange, recipePageTitle, historyPage, pageCursor,
    getActiveBrewery: async () => ({ id: "brewery", roles: ["admin"], timeZone: "UTC" }),
    buildContext: async () => ctx,
    getPortalContext: async () => ({ customer: { customerId: "customer" }, ctx }),
    runPageQuery: query, runCommand: query,
    requirePagePermission: () => {}, canRun: () => true,
    optionalPageQuery: async () => undefined,
  };
  for (const file of ["orders/order-data.ts", "invoices/invoice-data.ts", "customers/customer-data.ts", "recipes/recipe-data.ts", "locations/location-data.ts", "vendors/vendor-data.ts"]) {
    Object.assign(bindings, loadPage(`app/(app)/${file}`, bindings));
  }
  return { bindings, calls };
}

const RECORDS = [
  ["batches/[id]", "id", "get_brew_day"],
  ["catalog/brands/[id]", "id", "list_brands"],
  ["catalog/brands/[id]/skus", "id", "list_brands"],
  ["catalog/formats/[id]", "id", "get_format_composition"],
  ["cellar/[occupancyId]/reading", "occupancyId", "list_occupancies"],
  ["cellar/vessels/[id]", "id", "list_vessels"],
  ["compliance/lots/[id]", "id", "trace_lot"],
  ["compliance/material-lots/[id]", "id", "trace_material_lot"],
  ["customers/[id]", "id", "get_customer"],
  ["inventory/[id]", "id", "get_inventory_sku"],
  ["invoices/[id]", "id", "get_invoice"],
  ["invoices/[id]/mapping", "id", "get_invoice"],
  ["invoices/[id]/return", "id", "get_invoice"],
  ["kegs/customers/[customerId]", "customerId", "list_customers"],
  ["locations/[id]", "id", "list_locations"],
  ["menu/item/[formatId]", "formatId", "list_pos_locations"],
  ["orders/[id]", "id", "get_order"],
  ["orders/[id]/complete", "id", "get_order"],
  ["orders/[id]/confirm", "id", "get_order"],
  ["orders/[id]/edit", "id", "get_order"],
  ["orders/[id]/pick", "id", "get_order"],
  ["orders/[id]/restock", "id", "get_order"],
  ["orders/[id]/ship", "id", "get_order"],
  ["packaging/[id]", "id", "get_packaging_run"],
  ["purchase-orders/[id]", "id", "get_purchase_order"],
  ["purchase-orders/[id]/edit", "id", "get_purchase_order"],
  ["recipes/[id]", "id", "get_recipe"],
  ["recipes/[id]/new", "id", "get_recipe"],
  ["routes/[id]", "id", "list_routes"],
  ["settings/pos/sales/[id]", "id", "get_pos_sale"],
  ["transfers/[id]", "id", "get_stock_transfer"],
  ["vendors/[id]", "id", "list_vendors_and_contracts"],
  ["work/deliveries/[id]", "id", "get_delivery_stop"],
  ["work/deliveries/[id]/return", "id", "get_delivery_stop"],
] as const;

function dynamicPages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return dynamicPages(path);
    return entry.name === "page.tsx" && path.includes("[") ? [path] : [];
  });
}

describe("missing-record browser metadata", () => {
  it("covers every dynamic staff record route and the period and missing-address validators", () => {
    const root = join(ROOT, "app/(app)");
    const actual = dynamicPages(root).map((path) => path.slice(root.length + 1, -"/page.tsx".length)).sort();
    expect(actual).toEqual([...RECORDS.map(([route]) => route), "compliance/[period]", "[...missing]"].sort());
  });

  it.each(RECORDS)("%s rejects missing metadata and rendering at the authorized read boundary", async (route, parameter, primary) => {
    const { bindings, calls } = requestBindings();
    const page = loadPage(`app/(app)/${route}/page.tsx`, bindings);
    const props = { params: Promise.resolve({ [parameter]: MISSING }), searchParams: Promise.resolve({}) };
    await expect(page.generateMetadata(props)).rejects.toMatchObject(NOT_FOUND);
    expect(calls).toContain(primary);
    await expect(page.default(props)).rejects.toMatchObject(NOT_FOUND);
  });

  it.each(["portal/orders/[id]", "portal/invoices/[id]", "portal"])("%s rejects missing customer-owned records in metadata", async (route) => {
    const { bindings, calls } = requestBindings();
    const page = loadPage(`app/(portal)/${route}/page.tsx`, bindings);
    const props = { params: Promise.resolve({ id: MISSING }), searchParams: Promise.resolve({ reorder: MISSING }) };
    await expect(page.generateMetadata(props)).rejects.toMatchObject(NOT_FOUND);
    await expect(page.default(props)).rejects.toMatchObject(NOT_FOUND);
    const primary = route.includes("invoices") ? "portal_invoice" : "portal_order";
    expect(calls).toContain(primary);
  });

  it("rejects malformed compliance periods during metadata resolution", async () => {
    const { bindings } = requestBindings();
    const page = loadPage("app/(app)/compliance/[period]/page.tsx", bindings);
    await expect(page.generateMetadata({ params: Promise.resolve({ period: "2026-13" }), searchParams: Promise.resolve({}) })).rejects.toMatchObject(NOT_FOUND);
  });

  it.each(["(app)", "(portal)"])("%s not-found metadata provides one canonical title without inline title elements", (group) => {
    const file = `app/${group}/not-found.tsx`;
    expect(loadPage(file, {}).metadata).toEqual({ title: "Not found" });
    expect(readFileSync(join(ROOT, file), "utf8")).not.toContain("<title");
  });
});

describe("successful record metadata", () => {
  it.each([
    ["cellar/vessels/[id]", "list_vessels", "New vessel", "Cellar"],
    ["catalog/brands/[id]", "list_brands", "New brand", "Catalog"],
  ])("distinguishes creation and saved records at %s", async (route, primary, creationTitle, savedTitle) => {
    const { bindings } = requestBindings();
    const query = bindings.runCommand as (name: string) => Promise<unknown>;
    const read = async (name: string) => name === primary ? [{ id: MISSING, name: "Saved record" }] : query(name);
    const page = loadPage(`app/(app)/${route}/page.tsx`, { ...bindings, runCommand: read, runPageQuery: read });
    expect(await page.generateMetadata({ params: Promise.resolve({ id: "new" }), searchParams: Promise.resolve({}) })).toEqual({ title: creationTitle });
    expect(await page.generateMetadata({ params: Promise.resolve({ id: MISSING }), searchParams: Promise.resolve({}) })).toEqual({ title: savedTitle });
  });

  it("names the recipe and selected version instead of its section", async () => {
    const { bindings } = requestBindings();
    const data = loadPage("app/(app)/recipes/recipe-data.ts", {
      ...bindings,
      runPageQuery: async (name: string, input: { recipeId: string; version?: number }) => {
        expect(name).toBe("get_recipe");
        expect(input.recipeId).toBe(MISSING);
        return { recipe: { name: "Cedar pale" }, version: { version: input.version ?? 3 } };
      },
    });
    const page = loadPage("app/(app)/recipes/[id]/page.tsx", { ...bindings, ...data });
    expect(await page.generateMetadata({ params: Promise.resolve({ id: MISSING }), searchParams: Promise.resolve({ v: "1" }) })).toEqual({ title: "Cedar pale v1" });
    expect(await page.generateMetadata({ params: Promise.resolve({ id: MISSING }), searchParams: Promise.resolve({}) })).toEqual({ title: "Cedar pale v3" });
  });

  it("names the next recipe version after its recipe", async () => {
    const { bindings } = requestBindings();
    const data = loadPage("app/(app)/recipes/recipe-data.ts", {
      ...bindings,
      runPageQuery: async () => ({ recipe: { name: "Cedar pale" } }),
    });
    const page = loadPage("app/(app)/recipes/[id]/new/page.tsx", { ...bindings, ...data });
    expect(await page.generateMetadata({ params: Promise.resolve({ id: MISSING }), searchParams: Promise.resolve({}) })).toEqual({ title: "Cedar pale · new version" });
  });

  it.each([
    ["locations/[id]", "North warehouse"],
  ])("names %s after its authorized location", async (route, title) => {
    const { bindings } = requestBindings();
    const data = loadPage("app/(app)/locations/location-data.ts", {
      ...bindings,
      runPageQuery: async () => [{ id: MISSING, name: "North warehouse" }],
    });
    const page = loadPage(`app/(app)/${route}/page.tsx`, { ...bindings, ...data });
    expect(await page.generateMetadata({ params: Promise.resolve({ id: MISSING }), searchParams: Promise.resolve({}) })).toEqual({ title });
  });

  it.each([
    ["2026-09", "September 2026 · Compliance"],
    ["2026-Q3", "Q3 2026 · Compliance"],
    ["2026", "2026 · Compliance"],
  ])("labels compliance period %s", async (period, title) => {
    const { bindings } = requestBindings();
    const page = loadPage("app/(app)/compliance/[period]/page.tsx", bindings);
    expect(await page.generateMetadata({ params: Promise.resolve({ period }), searchParams: Promise.resolve({}) })).toEqual({ title });
  });

  it.each([true, false])("matches the no-membership heading for staff=%s", async (staff) => {
    const page = loadPage("app/(auth)/no-membership/page.tsx", {
      getStaffMemberships: async () => staff ? [{}] : [],
      portalStaffOnlyModel,
      noMembershipModel,
    });
    expect(await page.generateMetadata({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })).toEqual({ title: staff ? "Portal is for customers" : "No brewery yet" });
  });
});
