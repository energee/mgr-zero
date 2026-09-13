import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Children, isValidElement, type ReactNode } from "react";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { SCREENS } from "@/components/mgr/screens";
import { SCREEN_ROUTES } from "@/lib/mgr/screen-routes";

/** Existing bypasses. Remove a row when the live implementation mounts the view. */
const KNOWN_VIEW_DEBT = [
  "Session expired: SessionExpiredView <- app/(auth)/login/page.tsx",
  "Entity picker: SearchView <- components/mgr/search-palette.tsx",
  "Return and credit: ReturnCreditView <- app/(app)/orders/[id]/page.tsx",
  "SKU: SkuView <- app/(app)/catalog/page.tsx",
  "SKU list: SkuListView <- app/(app)/catalog/page.tsx",
  "Vessel detail: VesselDetailView <- app/(app)/cellar/page.tsx",
  "Receipt: ReceiptView <- app/(app)/purchase-orders/[id]/page.tsx",
  "Cycle count: CycleCountView <- app/(app)/materials/page.tsx",
  "Materials: MaterialsView <- app/(app)/materials/page.tsx",
] as const;

/** Existing live screens whose inventory record still owns inline E.* markup. */
const KNOWN_INLINE_DEBT = [
  "Expired invite",
  "Accept invite",
  "Invite staff",
  "Team member",
  "Create brewery",
  "Import",
  "Weekly count",
  "Variance by brand",
  "Invite portal user",
  "Accounting",
  "Connect QuickBooks",
  "Mapping conflict",
  "Disconnect QuickBooks",
  "Invoices",
  "Fix mapping",
  "Cellar map",
  "Tap board",
  "Kick keg",
  "Swap keg",
  "Chat disconnected",
  "Chat settings",
  "Linked people",
  "Link your Slack",
  "Disconnect Slack",
  "Reauthorization",
] as const;

const KNOWN_SURFACE_DEBT = [
  "Search: CommandForm <- app/(app)/search/page.tsx",
  "Session expired: CommandForm <- app/(auth)/login/page.tsx",
  "Disconnect QuickBooks: CommandForm <- app/(app)/settings/accounting/disconnect/page.tsx",
  "Link your Slack: EntrySurface <- app/(app)/settings/chat/link/page.tsx",
  "Disconnect Slack: CommandForm <- app/(app)/settings/chat/disconnect/page.tsx",
] as const;

// Audited whole-body replacements, not action/message slots. Extend this
// focused list as each flow is inspected; a view import alone misses these.
const BODY_SLOTS: Record<string, string> = {
  CatalogView: "brands",
  ShopView: "catalog",
  SearchView: "palette",
};
const KNOWN_BODY_DEBT = [
  "Catalog: CatalogView.brands <- app/(app)/catalog/page.tsx",
  "Search: SearchView.palette <- app/(app)/search/page.tsx",
];

function inventoryViews(node: ReactNode, out = new Set<string>()): Set<string> {
  if (!isValidElement<{ children?: ReactNode }>(node)) return out;
  if (typeof node.type === "function" && node.type.name.endsWith("View")) out.add(node.type.name);
  Children.forEach(node.props.children, (child) => inventoryViews(child, out));
  return out;
}

function sourceFile(path: string) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function localModule(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? resolve(specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : undefined;
  if (!base) return undefined;
  return [base, `${base}.tsx`, `${base}.ts`, resolve(base, "index.tsx"), resolve(base, "index.ts")]
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

/** Follow function-component exports, not every sibling in an imported module.
 * Named-only entry files still need explicit route symbols to disambiguate them.
 * This discovery check does not prove prop/slot or surface configuration parity.
 */
function mountedComponents(entry: string, bodyOverrides = new Set<string>()): Set<string> {
  const components = new Set<string>();
  const visited = new Set<string>();

  function visit(path: string, exported?: string) {
    const key = `${path}:${exported ?? "entry"}`;
    if (visited.has(key)) return;
    visited.add(key);
    const file = sourceFile(path);
    const imports = new Map<string, { imported: string; path?: string }>();

    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const target = localModule(path, statement.moduleSpecifier.text);
      const clause = statement.importClause;
      if (clause?.name) imports.set(clause.name.text, { imported: "default", path: target });
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          imports.set(element.name.text, { imported: element.propertyName?.text ?? element.name.text, path: target });
        }
      }
    }

    function walk(node: ts.Node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(file).split(".")[0];
        const imported = imports.get(tag);
        const name = imported?.imported === "default" ? tag : (imported?.imported ?? tag);
        components.add(name);
        if (node.attributes.properties.some(attribute =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(file) === BODY_SLOTS[name])) {
          bodyOverrides.add(`${name}.${BODY_SLOTS[name]}`);
        }
        if (imported?.path && !name.endsWith("View")) visit(imported.path, imported.imported);
        if (!imported) {
          const declaration = file.statements.find(statement =>
            ts.isFunctionDeclaration(statement) && statement.name?.text === tag);
          if (declaration && !visited.has(`${path}:local:${tag}`)) {
            visited.add(`${path}:local:${tag}`);
            walk(declaration);
          }
        }
      }
      ts.forEachChild(node, walk);
    }
    const functions = file.statements.filter(ts.isFunctionDeclaration);
    const isDefault = (node: ts.FunctionDeclaration) => node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
    const defaultFunction = functions.find(isDefault);
    const roots = exported === "default" || (!exported && defaultFunction)
      ? functions.filter(isDefault)
      : exported
        ? functions.filter(node => node.name?.text === exported)
        : functions.filter(node => node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
    for (const root of roots) walk(root);
  }

  visit(resolve(entry));
  return components;
}

describe("screen/live component parity", () => {
  const routes = new Map(SCREEN_ROUTES.map((route) => [route.name, route.file]));
  const mapped = SCREENS.filter((screen) => routes.has(screen.name));

  it("mounts each inventory shared view from its mapped live implementation", () => {
    const bypasses = mapped.flatMap((screen) => {
      const expected = inventoryViews(screen.body);
      if (!expected.size) return [];
      const file = routes.get(screen.name)!;
      const actual = mountedComponents(file);
      return [...expected]
        .filter((view) => !actual.has(view))
        .map((view) => `${screen.name}: ${view} <- ${file}`);
    });
    expect(bypasses).toEqual(KNOWN_VIEW_DEBT);
  });

  it("keeps mapped inventory screens out of inline E.* bodies", () => {
    const inline = mapped
      .filter((screen) => inventoryViews(screen.body).size === 0)
      .map((screen) => screen.name);
    expect(inline).toEqual(KNOWN_INLINE_DEBT);
  });

  it("mounts the same named surface as the inventory frame", () => {
    const expectedSurface = { sheet: "CommandForm", entry: "EntrySurface" } as const;
    const bypasses = mapped.flatMap((screen) => {
      const surface = screen.name === "Me" || screen.name === "Portal Me"
        ? "MeSheet"
        : screen.surface && expectedSurface[screen.surface as keyof typeof expectedSurface];
      if (!surface) return [];
      const file = routes.get(screen.name)!;
      return mountedComponents(file).has(surface) ? [] : [`${screen.name}: ${surface} <- ${file}`];
    });
    expect(bypasses).toEqual(KNOWN_SURFACE_DEBT);
  });

  it("follows mounted components and ignores unused view imports", () => {
    expect(mountedComponents("tests/fixtures/screen-parity/delegated.tsx")).toContain("ExampleView");
    expect(mountedComponents("tests/fixtures/screen-parity/unused.tsx")).not.toContain("ExampleView");
    expect(mountedComponents("tests/fixtures/screen-parity/unused-sibling.tsx")).not.toContain("ExampleView");
  });

  it("records audited whole-body slots even when the expected view is mounted", () => {
    const bypasses = mapped.flatMap(screen => {
      const file = routes.get(screen.name)!;
      const overrides = new Set<string>();
      mountedComponents(file, overrides);
      const expected = inventoryViews(screen.body);
      return [...overrides]
        .filter(override => expected.has(override.split(".")[0]))
        .map(override => `${screen.name}: ${override} <- ${file}`);
    }).sort();
    expect(bypasses).toEqual(KNOWN_BODY_DEBT);
  });
});
