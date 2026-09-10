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
  "Adjust lines: AdjustLinesView <- app/(app)/orders/[id]/page.tsx",
  "Short pick: ShortPickView <- app/(app)/orders/[id]/page.tsx",
  "Pick: PickView <- app/(app)/orders/[id]/page.tsx",
  "Ship and invoice: ShipView <- app/(app)/orders/[id]/page.tsx",
  "Shipment done: ShipmentDoneView <- app/(app)/orders/[id]/page.tsx",
  "Ship on delivery: ShipView <- app/(app)/orders/[id]/page.tsx",
  "Return and credit: ReturnCreditView <- app/(app)/orders/[id]/page.tsx",
  "New order: NewOrderView <- app/(app)/orders/page.tsx",
  "Ship-to form: ShipToView <- app/(app)/customers/[id]/page.tsx",
  "Package BOM: PackageBomView <- app/(app)/catalog/formats/[id]/page.tsx",
  "Brand: BrandView <- app/(app)/catalog/page.tsx",
  "SKU: SkuView <- app/(app)/catalog/page.tsx",
  "SKU list: SkuListView <- app/(app)/catalog/page.tsx",
  "Review order: ReviewOrderView <- app/(portal)/portal/page.tsx",
  "Question invoice: QuestionInvoiceView <- app/(portal)/portal/invoices/[id]/page.tsx",
  "Vessel detail: VesselDetailView <- app/(app)/cellar/page.tsx",
  "Schedule batch: ScheduleBatchView <- app/(app)/batches/page.tsx",
  "New PO: NewPoView <- app/(app)/purchase-orders/page.tsx",
  "Receipt: ReceiptView <- app/(app)/purchase-orders/[id]/page.tsx",
  "Cycle count: CycleCountView <- app/(app)/materials/page.tsx",
  "Materials: MaterialsView <- app/(app)/materials/page.tsx",
  "Material: MaterialView <- app/(app)/materials/page.tsx",
  "Vendor: VendorView <- app/(app)/vendors/page.tsx",
  "Contract: ContractView <- app/(app)/vendors/page.tsx",
  "Brand approval: BrandApprovalView <- app/(app)/compliance/registry/page.tsx",
  "State registration: StateRegistrationView <- app/(app)/compliance/registry/page.tsx",
  "License: LicenseView <- app/(app)/compliance/registry/page.tsx",
  "Channel: ChannelView <- app/(app)/settings/channels/page.tsx",
  "Formats: FormatsView <- app/(app)/catalog/page.tsx",
  "Format: FormatView <- app/(app)/catalog/formats/[id]/page.tsx",
  "Price group: PriceGroupView <- app/(app)/pricing/page.tsx",
  "Bin: BinView <- app/(app)/locations/[id]/bins/page.tsx",
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
  "Session expired: CommandForm <- app/(auth)/login/page.tsx",
  "Link your Slack: EntrySurface <- app/(app)/settings/chat/link/page.tsx",
  "Disconnect Slack: CommandForm <- app/(app)/settings/chat/disconnect/page.tsx",
] as const;

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

/** Components actually mounted by the entry file or a mounted child component. */
function mountedComponents(entry: string): Set<string> {
  const components = new Set<string>();
  const visited = new Set<string>();

  function visit(path: string) {
    if (visited.has(path)) return;
    visited.add(path);
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
        if (imported?.path && !name.endsWith("View")) visit(imported.path);
      }
      ts.forEachChild(node, walk);
    }
    walk(file);
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
  });
});
