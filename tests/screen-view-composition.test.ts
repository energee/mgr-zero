import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Children, isValidElement, type ReactNode } from "react";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { SCREENS } from "@/components/mgr/screens";
import { SCREEN_ROUTES } from "@/lib/mgr/screen-routes";
import { localModule } from "./local-module";

/** Existing bypasses. Remove a row when the live implementation mounts the view. */
const KNOWN_VIEW_DEBT = [] as const;

/** Existing live screens whose inventory record still owns inline E.* markup. */
const KNOWN_INLINE_DEBT = [] as const;

const KNOWN_SURFACE_DEBT = [
] as const;

// Audited whole-body replacements, not action/message slots. Extend this
// focused list as each flow is inspected; a view import alone misses these.
const BODY_SLOTS: Record<string, readonly string[]> = {
  // CatalogView has no body-replacement slot left: `rowExtra` adds under a row
  // and cannot replace the rows, which tests/catalog-view.test.ts asserts.
  ShopView: ["catalog"],
  NewPoView: ["form"],
  ReceivePoView: ["review"],
  TeamView: ["rows"],
  BatchesView: ["list"],
  BrewDayView: ["body"],
  RoutesView: ["list"],
  RouteView: ["form"],
  WorkView: ["list"],
  InvoiceView: ["qboGate", "accountingActions"],
  BeerView: ["navs"],
  ClosePackagingRunView: ["lead"],
  KegFleetView: ["list"],
  TransferDetailView: ["footer"],
};
const SHARED_SLOT_VIEWS: Record<string, string> = { "InvoiceView.accountingActions": "InvoiceAccountingActionsView" };
const KNOWN_BODY_DEBT: string[] = [];

function inventoryViews(node: ReactNode, out = new Set<string>()): Set<string> {
  if (!isValidElement<{ children?: ReactNode }>(node)) return out;
  if (typeof node.type === "function" && node.type.name.endsWith("View")) out.add(node.type.name);
  Children.forEach(node.props.children, (child) => inventoryViews(child, out));
  return out;
}

function sourceFile(path: string) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** `file:line` of every `if (…) return <jsx>` in a file: a view choosing a
 * second layout from inside, which the mounted-component walk cannot see
 * because both trees mount the same view. `return null` draws no layout. */
function earlyLayoutReturns(path: string): string[] {
  const file = sourceFile(path);
  const out: string[] = [];
  const isJsx = (node: ts.Expression): boolean => ts.isParenthesizedExpression(node)
    ? isJsx(node.expression)
    : ts.isJsxElement(node) || ts.isJsxFragment(node) || ts.isJsxSelfClosingElement(node);
  function inIf(node: ts.Node) {
    if (ts.isReturnStatement(node) && node.expression && isJsx(node.expression)) {
      out.push(`${relative(process.cwd(), path)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`);
    }
    if (!ts.isFunctionLike(node)) ts.forEachChild(node, inIf); // a nested callback's return is its own
  }
  function walk(node: ts.Node) {
    if (ts.isIfStatement(node)) inIf(node);
    else ts.forEachChild(node, walk);
  }
  walk(file);
  return out;
}

/** Follow function-component exports, not every sibling in an imported module.
 * Named-only entry files still need explicit route symbols to disambiguate them.
 * This discovery check does not prove prop/slot or surface configuration parity.
 */
function mountedComponents(entry: string, bodyOverrides = new Set<string>(), entryExport?: string): Set<string> {
  const components = new Set<string>();
  const visited = new Set<string>();

  function visit(path: string, exported?: string) {
    const key = `${path}:${exported ?? "entry"}`;
    if (visited.has(key)) return;
    visited.add(key);
    const file = sourceFile(path);
    const imports = new Map<string, { imported: string; path?: string }>();
    let lazyImportName: string | undefined;
    let notFoundName: string | undefined;

    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const target = localModule(path, statement.moduleSpecifier.text);
      const clause = statement.importClause;
      if (clause?.name) imports.set(clause.name.text, { imported: "default", path: target });
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (statement.moduleSpecifier.text === "react" && (element.propertyName?.text ?? element.name.text) === "lazy") lazyImportName = element.name.text;
          if (statement.moduleSpecifier.text === "next/navigation" && (element.propertyName?.text ?? element.name.text) === "notFound") notFoundName = element.name.text;
          imports.set(element.name.text, { imported: element.propertyName?.text ?? element.name.text, path: target });
        }
      }
    }

    // Follow mounted React.lazy default imports, not every component exported
    // by the deferred module.
    for (const statement of file.statements) {
      if (!lazyImportName || !ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (!ts.isIdentifier(declaration.name) || !initializer || !ts.isCallExpression(initializer)
          || !ts.isIdentifier(initializer.expression) || initializer.expression.text !== lazyImportName) continue;
        const loader = initializer.arguments[0];
        if (!loader || !ts.isArrowFunction(loader) || !ts.isCallExpression(loader.body)) continue;
        const importCall = loader.body;
        if (importCall.expression.kind !== ts.SyntaxKind.ImportKeyword
          || !importCall.arguments[0] || !ts.isStringLiteral(importCall.arguments[0])) continue;
        imports.set(declaration.name.text, {
          imported: "default",
          path: localModule(path, importCall.arguments[0].text),
        });
      }
    }

    function walk(node: ts.Node) {
      // Next renders the nearest not-found boundary when a mounted page throws
      // notFound(); the page itself intentionally has no JSX.
      if (notFoundName && ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === notFoundName) {
        let directory = dirname(path);
        const app = resolve("app");
        while (directory === app || directory.startsWith(`${app}/`)) {
          const boundary = join(directory, "not-found.tsx");
          if (existsSync(boundary)) {
            visit(boundary, "default");
            break;
          }
          directory = dirname(directory);
        }
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(file).split(".")[0];
        const imported = imports.get(tag);
        const name = imported?.imported === "default" ? tag : (imported?.imported ?? tag);
        components.add(name);
        const slots = BODY_SLOTS[name];
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute) || !slots?.includes(attribute.name.getText(file))) continue;
          const slot = `${name}.${attribute.name.getText(file)}`;
          const expected = SHARED_SLOT_VIEWS[slot];
          const value = attribute.initializer;
          const expression = value && ts.isJsxExpression(value) ? value.expression : undefined;
          let child: ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined;
          if (expression && ts.isJsxElement(expression)) child = expression.openingElement;
          if (expression && ts.isJsxSelfClosingElement(expression)) child = expression;
          const binding = child ? imports.get(child.tagName.getText(file)) : undefined;
          // An authorized adapter may fill the slot only by mounting its shared drawing.
          const shared = expected && binding?.path && (binding.imported === expected
            || mountedComponents(binding.path, new Set(), binding.imported).has(expected));
          if (!shared) bodyOverrides.add(slot);
        }
        if (imported?.path) visit(imported.path, imported.imported);
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

  visit(resolve(entry), entryExport);
  return components;
}

describe("screen/live component parity", () => {
  const routes = new Map(SCREEN_ROUTES.map((route) => [route.name, route.file]));
  const mapped = SCREENS.filter((screen) => routes.has(screen.name));

  it("mounts each inventory shared view from its mapped live implementation", () => {
    const bypasses = mapped.flatMap((screen) => {
      const expected = inventoryViews(screen.body);
      if (!expected.size) return [];
      const route = SCREEN_ROUTES.find((candidate) => candidate.name === screen.name)!;
      return [route.file, ...(route.additionalFiles ?? [])].flatMap((file) => {
        const actual = mountedComponents(file);
        return [...expected]
          .filter((view) => !actual.has(view))
          .map((view) => `${screen.name}: ${view} <- ${file}`);
      });
    });
    expect(bypasses).toEqual(KNOWN_VIEW_DEBT);
  });

  it("shares the complete replenishment page instead of repeating single-SKU Pars screens", () => {
    const screen = SCREENS.find(candidate => candidate.name === "Pars and allocation")!;
    expect([...inventoryViews(screen.body)]).toEqual(["ReplenishmentView"]);
    const mounted = mountedComponents(routes.get(screen.name)!);
    expect(mounted).toContain("ReplenishmentView");
    expect(mounted).not.toContain("ParsView");
  });

  it("keeps mapped inventory screens out of inline E.* bodies", () => {
    const inline = mapped
      .filter((screen) => inventoryViews(screen.body).size === 0)
      .map((screen) => screen.name);
    expect(inline).toEqual(KNOWN_INLINE_DEBT);
  });

  it("mounts the same named surface as the inventory frame", () => {
    const expectedSurface = { sheet: "CommandForm", entry: "EntrySurface", composer: "ComposerPanelView" } as const;
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

  it("draws each shared view as one JSX tree: no early return into a second layout", () => {
    expect(earlyLayoutReturns("tests/fixtures/screen-parity/early-return.tsx")).toEqual(["tests/fixtures/screen-parity/early-return.tsx:5"]);
    const views = readdirSync("components/mgr/views").filter(name => name.endsWith(".tsx"));
    expect(views.flatMap(name => earlyLayoutReturns(join("components/mgr/views", name)))).toEqual([]);
  });

  it("follows mounted components and ignores unused view imports", () => {
    expect(mountedComponents("tests/fixtures/screen-parity/delegated.tsx")).toContain("ExampleView");
    expect(mountedComponents("tests/fixtures/screen-parity/unused.tsx")).not.toContain("ExampleView");
    expect(mountedComponents("tests/fixtures/screen-parity/unused-sibling.tsx")).not.toContain("ExampleView");
    expect(mountedComponents("tests/fixtures/screen-parity/lazy-delegated.tsx")).toContain("ExampleView");
    expect(mountedComponents("tests/fixtures/screen-parity/lazy-unused.tsx")).not.toContain("ExampleView");
  });

  it("rejects a retired transfer footer replacement and accepts shared delegation", () => {
    const overrides = new Set<string>();
    expect(mountedComponents("tests/fixtures/screen-parity/transfer-footer.tsx", overrides)).toContain("TransferDetailView");
    expect([...overrides]).toEqual(["TransferDetailView.footer"]);
    const delegatedOverrides = new Set<string>();
    expect(mountedComponents("tests/fixtures/screen-parity/transfer-footer.tsx", delegatedOverrides, "TransferDelegation")).toContain("TransferDetailView");
    expect([...delegatedOverrides]).toEqual([]);
    const liveOverrides = new Set<string>();
    mountedComponents("app/(app)/transfers/[id]/page.tsx", liveOverrides);
    expect([...liveOverrides]).not.toContain("TransferDetailView.footer");
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
