// Staff pages title their browser tabs from navTitle, or from the same record
// data as their heading (#1255). The root layout owns the brand suffix.
// Unchanged record areas retain their navigation section title (#1230).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { navTitle } from "@/lib/mgr/nav";
import { periodLabel, periodRange } from "@/lib/compliance-period";
import { recipePageTitle } from "@/lib/mgr/recipe-view";
import { noMembershipModel, portalStaffOnlyModel } from "@/lib/mgr/entry-view";

const ROOT = join(__dirname, "..");
const APP = join(ROOT, "app", "(app)");

const DYNAMIC_TITLES: Readonly<Record<string, string>> = {
  "/recipes/[id]": "recipePageTitle(snapshot)",
  "/recipes/[id]/new": "`${snapshot.recipe.name} · new version`",
  "/locations/[id]": "location.name",
  "/locations/[id]/bins": "`Bins at ${location.name}`",
  "/compliance/[period]": "`${periodLabel(period)} · Compliance`",
  "/cellar/vessels/[id]": 'navTitle(id === "new" ? "/cellar/vessels/new" : "/cellar/vessels")',
  "/catalog/brands/[id]": 'navTitle(id === "new" ? "/catalog/brands/new" : "/catalog/brands")',
};

/** Every page.tsx under app/(app), as [route, source]. */
function pages(dir = APP): [string, string][] {
  return readdirSync(dir).flatMap((name): [string, string][] => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    if (name !== "page.tsx") return [];
    return [["/" + relative(APP, dir).split(sep).join("/"), readFileSync(p, "utf8")]];
  });
}

/** Execute the actual exported metadata function without loading unrelated page effects. */
function metadataFunction(route: string, bindings: Record<string, unknown>) {
  const source = readFileSync(join(APP, route, "page.tsx"), "utf8");
  const file = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = file.statements.filter((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && (node.name?.text === "generateMetadata" || node.name?.text === "selectedVersion"));
  if (!declarations.some((node) => node.name?.text === "generateMetadata")) throw new Error(`No metadata function at ${route}`);
  const { outputText } = ts.transpileModule(declarations.map((node) => node.getText(file)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports: { generateMetadata?: (props: unknown) => Promise<{ title: string }> } = {};
  new Function("exports", ...Object.keys(bindings), outputText)(exports, ...Object.values(bindings));
  return exports.generateMetadata!;
}

/** The route up to its first [param] segment: /orders/[id]/ship → /orders. */
function staticParent(route: string): string {
  const i = route.indexOf("/[");
  return i === -1 ? route : route.slice(0, i);
}

describe("staff page titles", () => {
  const titled = pages().filter(([route]) => route !== "/denied");

  it("finds the static and record staff pages", () => {
    const routes = titled.map(([route]) => route);
    expect(routes).toContain("/orders");
    expect(routes).toContain("/");
    expect(routes).toContain("/orders/[id]");
  });

  it("titles static pages from their route and record pages from their heading data", () => {
    for (const [route, source] of titled) {
      const dynamicTitle = DYNAMIC_TITLES[route];
      if (dynamicTitle) {
        expect.soft(source, route).toContain("export async function generateMetadata(");
        expect.soft(source, route).toContain(`return { title: ${dynamicTitle} };`);
        expect.soft(source, route).not.toContain("export const metadata");
      } else {
        expect.soft(source, route).toContain(`export const metadata = { title: navTitle("${staticParent(route)}") };`);
      }
    }
  });

  it("shares the request-cached authorized record read between metadata and the live page", () => {
    for (const [route, reader] of [
      ["/recipes/[id]", "getRecipePageData"],
      ["/recipes/[id]/new", "getRecipePageData"],
      ["/locations/[id]", "getLocationPageData"],
      ["/locations/[id]/bins", "getLocationPageData"],
    ]) {
      const source = titled.find(([candidate]) => candidate === route)![1];
      expect(source.match(new RegExp(`await ${reader}\\(`, "g")), route).toHaveLength(2);
    }
    for (const file of ["recipes/recipe-data.ts", "locations/location-data.ts"]) {
      const source = readFileSync(join(APP, file), "utf8");
      expect(source).toContain("cache(async function");
      expect(source).toContain("runPageQuery(");
    }
  });

  it("names the staff portal notice and no-brewery notice after their actual heading", () => {
    const source = readFileSync(join(ROOT, "app/(auth)/no-membership/page.tsx"), "utf8");
    expect(source).toContain("return { title: staff ? portalStaffOnlyModel.title : noMembershipModel.title };");
  });
});

describe("creation-route metadata functions", () => {
  it.each([
    ["cellar/vessels/[id]", "New vessel", "Cellar"],
    ["catalog/brands/[id]", "New brand", "Catalog"],
  ])("titles new and existing records at %s using the route parameter", async (route, title, section) => {
    const metadata = metadataFunction(route, { navTitle });
    expect(await metadata({ params: Promise.resolve({ id: "new" }) })).toEqual({ title });
    expect(await metadata({ params: Promise.resolve({ id: "record-id" }) })).toEqual({ title: section });
  });
});

describe("record-route metadata functions", () => {
  it("uses the selected recipe version, not the Recipes section", async () => {
    const metadata = metadataFunction("recipes/[id]", {
      recipePageTitle,
      getRecipePageData: async (id: string, version?: number) => {
        expect(id).toBe("recipe-id");
        return { snapshot: { recipe: { name: "Cedar pale" }, version: { version: version ?? 3 } } };
      },
    });
    expect(await metadata({ params: Promise.resolve({ id: "recipe-id" }), searchParams: Promise.resolve({ v: "1" }) })).toEqual({ title: "Cedar pale v1" });
    expect(await metadata({ params: Promise.resolve({ id: "recipe-id" }), searchParams: Promise.resolve({}) })).toEqual({ title: "Cedar pale v3" });
  });

  it.each([
    ["recipes/[id]/new", "Cedar pale · new version"],
    ["locations/[id]", "North warehouse"],
    ["locations/[id]/bins", "Bins at North warehouse"],
  ])("titles %s from the same authorized record as the heading", async (route, title) => {
    const metadata = metadataFunction(route, {
      getRecipePageData: async () => ({ snapshot: { recipe: { name: "Cedar pale" } } }),
      getLocationPageData: async () => ({ location: { name: "North warehouse" } }),
    });
    expect(await metadata({ params: Promise.resolve({ id: "record-id" }) })).toEqual({ title });
  });

  it.each([
    ["2026-09", "September 2026 · Compliance"],
    ["2026-Q3", "Q3 2026 · Compliance"],
    ["2026", "2026 · Compliance"],
  ])("labels compliance period %s", async (period, title) => {
    const metadata = metadataFunction("compliance/[period]", { periodLabel, periodRange, notFound: () => { throw new Error("not found"); } });
    expect(await metadata({ params: Promise.resolve({ period }) })).toEqual({ title });
  });

  it("rejects invalid compliance periods", async () => {
    const metadata = metadataFunction("compliance/[period]", { periodLabel, periodRange, notFound: () => { throw new Error("not found"); } });
    await expect(metadata({ params: Promise.resolve({ period: "2026-13" }) })).rejects.toThrow("not found");
  });

  it.each([true, false])("matches the no-membership heading for staff=%s", async (staff) => {
    const metadata = metadataFunction("../(auth)/no-membership", {
      getStaffMemberships: async () => staff ? [{}] : [],
      portalStaffOnlyModel,
      noMembershipModel,
    });
    expect(await metadata({})).toEqual({ title: staff ? "Portal is for customers" : "No brewery yet" });
  });
});

describe("title suffix", () => {
  it("the root layout appends \" · MGR\" to every page title", () => {
    expect(readFileSync(join(ROOT, "app", "layout.tsx"), "utf8")).toContain('template: "%s · MGR"');
  });

  it("the docs page leaves the suffix to the root template", () => {
    expect(readFileSync(join(ROOT, "app", "(docs)", "docs", "[[...slug]]", "page.tsx"), "utf8")).not.toContain("· MGR");
  });
});
