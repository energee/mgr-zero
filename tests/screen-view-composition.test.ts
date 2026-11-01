import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Children, isValidElement, type ReactNode } from "react";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { SCREENS, type Screen } from "@/components/mgr/screens";
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

let program: ts.Program | undefined;

function sourceProgram() {
  if (!program) {
    const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
    if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
    const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
    const roots = [
      ...SCREEN_ROUTES.flatMap(routeFiles),
      ...readdirSync("app", { recursive: true }).map(String).filter(file => /(?:^|\/)(?:layout|not-found)\.tsx$/.test(file)).map(file => join("app", file)),
      ...readdirSync("components/mgr/views").filter(file => file.endsWith(".tsx")).map(file => join("components/mgr/views", file)),
      ...readdirSync("tests/fixtures/screen-parity").filter(file => file.endsWith(".tsx")).map(file => join("tests/fixtures/screen-parity", file)),
    ];
    program = ts.createProgram([...new Set(roots)], options);
  }
  return program;
}

function sourceFile(path: string) {
  const file = sourceProgram().getSourceFile(resolve(path));
  if (!file) throw new Error(`Parity source is outside the mounted graph: ${path}`);
  return file;
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

function declarations(node: ts.Node): readonly ts.Declaration[] {
  const checker = sourceProgram().getTypeChecker();
  let symbol = ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent)
    ? checker.getShorthandAssignmentValueSymbol(node.parent)
    : checker.getSymbolAtLocation(node);
  if (symbol?.flags && (symbol.flags & ts.SymbolFlags.Alias)) symbol = checker.getAliasedSymbol(symbol);
  return symbol?.declarations ?? [];
}

let callers: Map<ts.Declaration, ts.JsxAttributes[]> | undefined;

/** Index actual JSX callers so forwarding a slot through a live adapter remains auditable. */
function componentCalls(owner: ts.Declaration): ts.JsxAttributes[] {
  if (!callers) {
    callers = new Map();
    function visit(node: ts.Node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        for (const target of declarations(node.tagName)) {
          const attributes = callers!.get(target) ?? [];
          attributes.push(node.attributes);
          callers!.set(target, attributes);
        }
      }
      ts.forEachChild(node, visit);
    }
    for (const file of sourceProgram().getSourceFiles()) {
      if (!file.isDeclarationFile && !file.fileName.includes("/node_modules/")) visit(file);
    }
  }
  return callers.get(owner) ?? [];
}

/** Resolve slot expressions semantically: aliases and local bindings cannot hide a second form/table. */
function slotPresentation(node: ts.Node): string[] {
  const checker = sourceProgram().getTypeChecker();
  const expression = ts.isJsxExpression(node) ? node.expression : undefined;
  if (expression) {
    const signatures = checker.getTypeAtLocation(expression).getCallSignatures();
    function returnsElement(type: ts.Type): boolean {
      if (type.isUnion()) return type.types.some(returnsElement);
      if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true;
      const item = type.getNumberIndexType();
      return item ? returnsElement(item) : Boolean(type.getProperty("props") && type.getProperty("type") && type.getProperty("key"));
    }
    // Form actions are callbacks, not drawing slots. Render callbacks return React elements.
    if (signatures.length && signatures.every(signature => !returnsElement(signature.getReturnType()))) return [];
  }
  const seen = new Set<ts.Node>();
  const violations = new Set<string>();
  const scalar = (type: ts.Type): boolean => {
    if (type.isUnion()) return type.types.every(scalar);
    if (type.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never)) return true;
    const item = type.getNumberIndexType();
    return Boolean(item && scalar(item));
  };
  function inspect(expression: ts.Node) {
    const file = expression.getSourceFile();
    if (file.isDeclarationFile || resolve(file.fileName).includes("/components/mgr/views/") || ts.isTypeNode(expression)) return;
    if (seen.has(expression)) return;
    seen.add(expression);
    if (ts.isJsxExpression(expression)) { if (expression.expression) inspect(expression.expression); return; }
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) { inspect(expression.expression); return; }
    if (ts.isVoidExpression(expression)) return;
    if (ts.isConditionalExpression(expression)) { inspect(expression.whenTrue); inspect(expression.whenFalse); return; }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) { inspect(expression.right); return; }
    if (ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression)) {
      const opening = ts.isJsxElement(expression) ? expression.openingElement : expression;
      const tag = opening.tagName.getText();
      const owners = declarations(opening.tagName);
      // Shared drawings own their internal fields; a live adapter may only bind them.
      if (owners.some(owner => resolve(owner.getSourceFile().fileName).includes("/components/mgr/views/"))) return;
      if (/^(input|select|textarea|table|thead|tbody|tr|td|th)$/.test(tag) || /^(Input|Textarea|Select|NativeSelect|Table)/.test(tag)) violations.add(`inline ${tag}`);
      const primitive = /^[a-z]/.test(tag) || owners.some(owner => /\/components\/ui\/|\/components\/mgr\/(?:command-form|submit-button|irreversible-submit)\.tsx$/.test(resolve(owner.getSourceFile().fileName)));
      if (!primitive && tag !== "Fragment") {
        if (owners.length) owners.forEach(inspect);
        else violations.add(`unresolved component ${tag}`);
      }
      if (ts.isJsxElement(expression)) expression.children.forEach(inspect);
      return;
    }
    if (ts.isObjectLiteralExpression(expression)) {
      for (const property of expression.properties) {
        if (ts.isPropertyAssignment(property)) inspect(property.initializer);
        else if (ts.isShorthandPropertyAssignment(property)) inspect(property.name);
        else if (ts.isSpreadAssignment(property)) inspect(property.expression);
        else inspect(property);
      }
      return;
    }
    if (ts.isFunctionDeclaration(expression) || ts.isFunctionExpression(expression) || ts.isArrowFunction(expression)) {
      const body = expression.body;
      if (!body) return;
      if (!ts.isBlock(body)) { inspect(body); return; }
      function returns(child: ts.Node) {
        if (ts.isReturnStatement(child)) { if (child.expression) inspect(child.expression); return; }
        if (!ts.isFunctionLike(child)) ts.forEachChild(child, returns);
      }
      ts.forEachChild(body, returns);
      return;
    }
    if (ts.isVariableDeclaration(expression)) {
      if (expression.initializer) inspect(expression.initializer);
      else {
        const variable = expression;
        let assigned = false;
        function assignments(child: ts.Node) {
          if (ts.isBinaryExpression(child) && child.operatorToken.kind === ts.SyntaxKind.EqualsToken && declarations(child.left).includes(variable)) {
            assigned = true;
            inspect(child.right);
          }
          ts.forEachChild(child, assignments);
        }
        assignments(expression.getSourceFile());
        if (!assigned) violations.add(`unresolved binding ${expression.name.getText()}`);
      }
      return;
    }
    if (ts.isBindingElement(expression)) {
      const parameter = expression.parent.parent;
      if (ts.isParameter(parameter)) inspectProp(parameter, (expression.propertyName ?? expression.name).getText());
      else violations.add(`unresolved binding ${expression.name.getText()}`);
      if (expression.initializer) inspect(expression.initializer);
      return;
    }
    if (ts.isCallExpression(expression)) {
      if (scalar(checker.getTypeAtLocation(expression))) return;
      const call = expression.expression;
      if (ts.isPropertyAccessExpression(call) && declarations(call.expression).some(owner => resolve(owner.getSourceFile().fileName).endsWith("/components/mgr/e.tsx"))) {
        if (/^(edit|fld|pick|searchPick|sw|tbl|row|qty|stq)$/.test(call.name.text)) {
          violations.add(`inline E.${call.name.text}`);
          return;
        }
        // Commands and hrefs are behavior, not rendered children of an action control.
        const children = call.name.text === "group" ? expression.arguments : expression.arguments.slice(0, 1);
        children.forEach(inspect);
        return;
      }
      const owners = declarations(call);
      owners.filter(owner => ts.isFunctionDeclaration(owner) || ts.isFunctionExpression(owner) || ts.isArrowFunction(owner) || ts.isVariableDeclaration(owner)).forEach(inspect);
      expression.arguments.forEach(inspect);
      return;
    }
    if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression)) {
      const type = checker.getTypeAtLocation(expression);
      if (scalar(type) || type.getCallSignatures().some(signature => scalar(signature.getReturnType()))) return;
      const owners = declarations(expression);
      const bound = owners.filter(owner => ts.isVariableDeclaration(owner) || ts.isFunctionDeclaration(owner));
      if (bound.length) { bound.forEach(inspect); return; }
      const binding = owners.find(ts.isBindingElement);
      const parameter = binding?.parent.parent;
      if (binding && parameter && ts.isParameter(parameter)) {
        inspectProp(parameter, (binding.propertyName ?? binding.name).getText());
        if (binding.initializer) inspect(binding.initializer);
      } else if (owners.some(ts.isParameter)) {
        owners.filter(ts.isParameter).forEach(parameter => inspectProp(parameter));
      } else if (ts.isPropertyAccessExpression(expression)) {
        const parameter = declarations(expression.expression).find(ts.isParameter);
        if (parameter) inspectProp(parameter, expression.name.text);
        else violations.add(`unresolved binding ${expression.getText()}`);
      } else violations.add(`unresolved binding ${expression.getText()}`);
      return;
    }
    ts.forEachChild(expression, inspect);
  }
  function inspectProp(parameter: ts.ParameterDeclaration, name?: string) {
    const fn = parameter.parent;
    if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isJsxExpression(fn.parent) && ts.isJsxAttribute(fn.parent.parent)) {
      const attribute = fn.parent.parent;
      const opening = attribute.parent.parent;
      let supplied = false;
      if (ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)) {
        for (const owner of declarations(opening.tagName).filter(ts.isFunctionDeclaration)) {
          const inputs = owner.parameters.flatMap(input => ts.isObjectBindingPattern(input.name) ? [...input.name.elements] : [])
            .filter(input => (input.propertyName ?? input.name).getText() === attribute.name.getText());
          function calls(child: ts.Node) {
            if (ts.isCallExpression(child) && inputs.some(input => declarations(child.expression).includes(input))) {
              const argument = child.arguments[fn.parameters.indexOf(parameter)];
              if (argument) {
                supplied = true;
                if (!name) inspect(argument);
                else {
                  const property = checker.getTypeAtLocation(argument).getProperty(name);
                  if (!property) violations.add(`unresolved callback property ${name}`);
                  for (const declaration of property?.declarations ?? []) {
                    if (ts.isPropertyAssignment(declaration)) inspect(declaration.initializer);
                    else if (ts.isShorthandPropertyAssignment(declaration)) inspect(declaration.name);
                    else violations.add(`unresolved callback property ${name}`);
                  }
                }
              }
            }
            ts.forEachChild(child, calls);
          }
          if (owner.body) calls(owner.body);
        }
      }
      if (!supplied) violations.add(`unresolved callback input ${parameter.name.getText()}`);
      return;
    }
    const owner = (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) ? fn.parent : fn;
    if (!name || !ts.isFunctionDeclaration(owner) && !ts.isVariableDeclaration(owner)) {
      violations.add(`unresolved prop ${name}`);
      return;
    }
    const uses = componentCalls(owner);
    if (!uses.length) violations.add(`unresolved prop ${owner.name?.getText()}.${name}`);
    for (const attributes of uses) {
      for (const attribute of attributes.properties) {
        if (ts.isJsxAttribute(attribute) && attribute.name.getText() === name && attribute.initializer) inspect(attribute.initializer);
        if (ts.isJsxSpreadAttribute(attribute)) {
          const property = checker.getTypeAtLocation(attribute.expression).getProperty(name);
          for (const declaration of property?.declarations ?? []) {
            if (ts.isPropertyAssignment(declaration)) inspect(declaration.initializer);
            else if (ts.isShorthandPropertyAssignment(declaration)) inspect(declaration.name);
            else violations.add(`unresolved spread prop ${name}`);
          }
        }
      }
    }
  }
  inspect(node);
  return [...violations].sort();
}

/** Follow function-component exports, not every sibling in an imported module.
 * Named-only entry files still need explicit route symbols to disambiguate them.
 * This discovery check does not prove prop/slot or surface configuration parity.
 */
function mountedComponents(entry: string, bodyOverrides = new Set<string>(), entryExport?: string, actionOverrides?: Set<string>): Set<string> {
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

    for (const statement of file.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)
        || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
      const target = localModule(path, statement.moduleSpecifier.text);
      if (!target) continue;
      for (const element of statement.exportClause.elements) {
        if (element.name.text === (exported ?? "default")) visit(target, element.propertyName?.text ?? element.name.text);
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
        // Slot inspection is type-checker work; only callers collecting action overrides need it.
        if (actionOverrides && name.endsWith("View")) {
          for (const attribute of node.attributes.properties) {
            if (!ts.isJsxAttribute(attribute) || !/(?:footer|actions?)$/i.test(attribute.name.getText(file))
              || /^on[A-Z]/.test(attribute.name.getText(file)) || !attribute.initializer) continue;
            const violations = slotPresentation(attribute.initializer);
            for (const violation of violations) actionOverrides.add(`${relative(process.cwd(), path)}: ${name}.${attribute.name.getText(file)}: ${violation}`);
          }
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

type LiveRoute = (typeof SCREEN_ROUTES)[number];
const routeFiles = (route: LiveRoute) => [route.file, ...(route.additionalFiles ?? [])];

function surfaceViolations(screen: Pick<Screen, "name" | "surface" | "portal">, route: LiveRoute): string[] {
  const expectedSurface = { sheet: "CommandForm", entry: "EntrySurface", composer: "ComposerPanelView" } as const;
  let surface: string;
  if (screen.name === "Me" || screen.name === "Portal Me") surface = "MeSheet";
  else if (!screen.surface || screen.surface === "page") surface = screen.portal ? "PortalShell" : "AppShell";
  else surface = expectedSurface[screen.surface];
  return routeFiles(route).flatMap(file => {
    const components = mountedComponents(file);
    // Next composes every public entry with its ancestor layouts.
    let directory = dirname(file);
    while (directory !== "." && directory !== "app") {
      const layout = join(directory, "layout.tsx");
      if (existsSync(layout)) for (const component of mountedComponents(layout)) components.add(component);
      directory = dirname(directory);
    }
    if (file.startsWith("components/") && surface === "AppShell") {
      const layout = mountedComponents("app/(app)/layout.tsx");
      const exports = sourceFile(file).statements.filter(ts.isFunctionDeclaration)
        .filter(node => node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
      if (exports.some(node => node.name && layout.has(node.name.text))) {
        for (const component of layout) components.add(component);
      }
    }
    return components.has(surface) ? [] : [`${screen.name}: ${surface} <- ${file}`];
  });
}

function bodyViolations(expected: Set<string>, route: LiveRoute): string[] {
  return routeFiles(route).flatMap(file => {
    const overrides = new Set<string>();
    mountedComponents(file, overrides);
    return [...overrides].filter(override => expected.has(override.split(".")[0]))
      .map(override => `${route.name}: ${override} <- ${file}`);
  });
}

function actionViolations(routes: LiveRoute[]): string[] {
  const slots = new Set<string>();
  for (const route of routes) {
    for (const file of routeFiles(route)) mountedComponents(file, new Set(), undefined, slots);
  }
  return [...slots].sort();
}

describe("screen/live component parity", () => {
  const routes = new Map(SCREEN_ROUTES.map((route) => [route.name, route.file]));
  const mapped = SCREENS.filter((screen) => routes.has(screen.name));

  it("mounts each inventory shared view from its mapped live implementation", () => {
    const bypasses = mapped.flatMap((screen) => {
      const expected = inventoryViews(screen.body);
      if (!expected.size) return [];
      const route = SCREEN_ROUTES.find((candidate) => candidate.name === screen.name)!;
      return routeFiles(route).flatMap((file) => {
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
    const bypasses = mapped.flatMap(screen => surfaceViolations(screen, SCREEN_ROUTES.find(route => route.name === screen.name)!));
    expect(bypasses).toEqual(KNOWN_SURFACE_DEBT);
  });

  it("checks additional public owners for surface and whole-body bypasses", () => {
    const route = { name: "Probe", file: "tests/fixtures/screen-parity/entry-surface.tsx", additionalFiles: ["tests/fixtures/screen-parity/additional-bypass.tsx"] };
    expect(surfaceViolations({ name: route.name, surface: "entry" }, { ...route, additionalFiles: [] })).toEqual([]);
    expect(surfaceViolations({ name: route.name, surface: "entry" }, route)).toEqual([
      "Probe: EntrySurface <- tests/fixtures/screen-parity/additional-bypass.tsx",
    ]);
    expect(bodyViolations(new Set(["ShopView"]), route)).toEqual([
      "Probe: ShopView.catalog <- tests/fixtures/screen-parity/additional-bypass.tsx",
    ]);
  });

  it("keeps the release workspace and its real confirmation owner in the graph", () => {
    const route = SCREEN_ROUTES.find(candidate => candidate.name === "Release standing allocation")!;
    for (const file of routeFiles(route)) {
      const components = mountedComponents(file);
      expect(components).toContain("ReplenishmentView");
      expect(components).toContain("ReleaseAllocationView");
      expect(components).toContain("CommandForm");
    }
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
    expect(mountedComponents("tests/fixtures/screen-parity/reexported.tsx")).toContain("ExampleView");
    expect(mountedComponents("tests/fixtures/screen-parity/unused-reexport.tsx")).not.toContain("ExampleView");
  });

  it("detects a transfer footer replacement even beside the shared document", () => {
    const overrides = new Set<string>();
    expect(mountedComponents("tests/fixtures/screen-parity/transfer-footer.tsx", overrides)).toContain("TransferDetailView");
    expect([...overrides]).toEqual(["TransferDetailView.footer"]);
    const liveOverrides = new Set<string>();
    mountedComponents("app/(app)/transfers/[id]/page.tsx", liveOverrides);
    expect([...liveOverrides]).not.toContain("TransferDetailView.footer");
  });

  it("records audited whole-body slots even when the expected view is mounted", () => {
    const bypasses = mapped.flatMap(screen => bodyViolations(inventoryViews(screen.body), SCREEN_ROUTES.find(route => route.name === screen.name)!)).sort();
    expect(bypasses).toEqual(KNOWN_BODY_DEBT);
  });

  it("keeps every mapped action slot with a shared drawing", () => {
    expect(actionViolations(SCREEN_ROUTES).join("\n")).toBe("");
  });

  it("rejects independent forms and tables hidden in whole-footer/action slots", () => {
    const bypass = new Set<string>();
    mountedComponents("tests/fixtures/screen-parity/action-bypass.tsx", new Set(), undefined, bypass);
    expect([...bypass]).toContain("tests/fixtures/screen-parity/action-bypass.tsx: ExampleView.footer: inline E.edit");
    expect([...bypass]).toContain("tests/fixtures/screen-parity/action-bypass.tsx: ExampleView.action: inline table");
    expect([...bypass]).toContain("tests/fixtures/screen-parity/action-bypass.tsx: TodayView.footer: inline E.edit");
    expect([...bypass]).toContain("tests/fixtures/screen-parity/action-bypass.tsx: TodayView.footer: inline E.pick");
    expect([...bypass]).toContain("tests/fixtures/screen-parity/action-bypass.tsx: TodayView.footer: inline E.sw");
    expect([...bypass]).toContain("tests/fixtures/screen-parity/action-bypass.tsx: TodayView.footer: inline table");
    expect([...bypass].filter(violation => violation.includes("unresolved"))).toEqual([]);
    const additional = actionViolations([{ name: "Probe", file: "tests/fixtures/screen-parity/action-delegated.tsx", additionalFiles: ["tests/fixtures/screen-parity/action-bypass.tsx"] }]);
    expect(additional).toEqual([...bypass].sort());
    expect(actionViolations([{ name: "Delegated", file: "tests/fixtures/screen-parity/action-delegated.tsx" }])).toEqual([]);
  });
});
