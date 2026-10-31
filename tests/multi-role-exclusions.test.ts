import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../lib/commands/all";
import { canRun, getCommandDefinition, type Ctx, type StaffRole } from "../lib/commands/registry";
import { hasAnyRole, onlyRoles } from "../lib/mgr/roles";
import { qboInvoicePresentation, qboStaffInvoiceLink } from "../lib/mgr/qbo-ui";
import { waterProfilesBack } from "../lib/mgr/water-profiles-view";
import { searchDestinations } from "../lib/mgr/search-palette-state";
import { WeeklyCountDraftView, WeeklyCountView } from "../components/mgr/views/weekly-count";
import { weeklyCount } from "../lib/mgr/fixtures/taproom";
import { asPersona } from "../components/mgr/demo-screens";
import { SCREENS } from "../components/mgr/screens";
import { defaultWorkKinds } from "../lib/commands/landings";
import AppLayout from "../app/(app)/layout";
import TodayPage from "../app/(app)/page";
import BeerPage from "../app/(app)/beer/page";
import LocationsPage from "../app/(app)/locations/page";
import ChatPreferencesPage from "../app/(app)/settings/chat/preferences/page";
import TaproomPage from "../app/(app)/taproom/page";
import InvoiceDetailPage from "../app/(app)/invoices/[id]/page";
import { SearchSheet } from "../components/mgr/search-palette";
import type * as PageQuery from "../lib/mgr/page-query";

const pageState = vi.hoisted(() => ({
  roles: ["taproom"] as StaffRole[],
  calls: [] as string[],
}));
vi.mock("@/lib/brewery", () => ({
  getActiveBrewery: async () => ({ id: "brewery", name: "Brewery", roles: pageState.roles, timeZone: "America/New_York", gravityUnit: "plato", myGravityUnit: null }),
}));
vi.mock("@/lib/commands/context", () => ({
  buildContext: async () => ({ userId: "actor", breweryId: "brewery", roles: pageState.roles }),
}));
vi.mock("@/lib/auth/request-context", () => ({
  getRequestIdentity: async () => ({ userId: "actor", email: "staff@example.test" }),
  getStaffMemberships: async () => [],
}));
vi.mock("@/lib/mgr/sidebar-state", () => ({ sidebarOpenFromCookie: async () => true }));
vi.mock("@/app/(auth)/actions", () => ({ switchBrewery: async () => undefined }));
vi.mock("@/lib/mgr/page-query", async importOriginal => ({
  ...(await importOriginal<typeof PageQuery>()),
  runPageQuery: async (name: string) => {
    pageState.calls.push(name);
    switch (name) {
      case "get_today": return [];
      case "get_beer_overview": return { fgShortages: 0, taproomBelowPar: 0, openTaps: 0, openOccupancies: 0, kegsOut: 0 };
      case "list_open_taps": return [];
      case "get_taproom_variance": return { as_of: "2026-10-16T12:00:00Z", reason: null, rows: [], periods: [] };
      case "list_locations": return [{ id: "tap", name: "Taproom", uses: ["taproom"] }];
      case "get_notification_preferences": return { preferences: [], quietStart: null, quietEnd: null, timezone: "America/New_York", link: null, installationActive: false, breweryQuietHours: null };
      case "get_taproom_count_snapshot": return { revision: "revision" };
      case "get_taproom_print_labels": return [{ bin_id: "bin", sku_id: "sku", lot_id: "lot", lot_code: "LOT-797" }];
      case "get_taproom_draft_projection": return null;
      case "list_taproom_counts": return [];
      case "get_taproom_count": return {
        id: "count", root_id: "count", location_id: "tap", counted_on: "2026-10-16", counted_by: "actor", created_at: "2026-10-16T12:00:00Z", correction_eligible: false,
        lines: [{ id: "line", bin_id: "bin", sku_id: "sku", lot_id: "lot", lot_code: "LOT-797", qty_before: 3, qty_counted: 3, movement_id: null, bbl: null }],
      };
      case "get_invoice": return {
        invoice: { id: "invoice", kind: "invoice", invoice_no: 797, issued_on: "2026-10-16", due_on: null, paid_at: null, qbo_sync_status: "pending", qbo_remote_state: "live", customers: null },
        lines: [], payments: [], hasPendingPush: false, wasPushedToQbo: false, localPaidCents: 0, localCreditCents: 0, quickbooksLink: null,
      };
      case "list_invoice_questions": return [];
      case "get_qbo_connection": return { connected: false, state: "disconnected", realmLabel: null };
      default: throw new Error(`Unexpected page query: ${name}`);
    }
  },
}));

beforeEach(() => { pageState.roles = ["taproom"]; pageState.calls = []; });

function includesElement(value: unknown, type: unknown): boolean {
  if (Array.isArray(value)) return value.some(child => includesElement(child, type));
  if (!isValidElement(value)) return false;
  const element = value as ReactElement<Record<string, unknown>>;
  return element.type === type || Object.values(element.props).some(child => includesElement(child, type));
}

describe("live page exclusion decisions", () => {
  it("mounts Search only when another held role permits it", async () => {
    expect(includesElement(await AppLayout({ children: null }), SearchSheet)).toBe(false);
    pageState.roles = ["taproom", "brewer"];
    expect(includesElement(await AppLayout({ children: null }), SearchSheet)).toBe(true);
  });

  it("chooses taproom Today only for taproom-only staff", async () => {
    await TodayPage();
    expect(pageState.calls).toContain("list_locations");
    expect(pageState.calls).not.toContain("get_today");
    pageState.roles = ["taproom", "brewer"]; pageState.calls = [];
    await TodayPage();
    expect(pageState.calls).toEqual(["get_today"]);
  });

  it("passes quiet-hours permission through the live preferences adapter", async () => {
    expect((await ChatPreferencesPage()).props.canSetQuietHours).toBe(false);
    pageState.roles = ["taproom", "brewer"];
    expect((await ChatPreferencesPage()).props.canSetQuietHours).toBe(true);
  });

  it("shows the inventory footer only when a held role grants inventory access", async () => {
    for (const roles of [["brewer"], ["taproom"], ["brewer", "taproom"]] as StaffRole[][]) {
      pageState.roles = roles;
      expect((await LocationsPage()).props.footer, roles.join("+")).toBeNull();
    }
    pageState.roles = ["brewer", "sales"];
    expect((await LocationsPage()).props.footer.props.href).toBe("/inventory");
  });

  it("keeps Taproom destinations when the general Beer landing gains another role", async () => {
    for (const other of ["sales", "brewer"] as const) {
      pageState.roles = ["taproom", other];
      const links = (await BeerPage()).props.model.navs.map((row: { href: string }) => row.href);
      expect(links).toContain("/taproom");
      expect(links).toContain("/taproom/board");
    }
  });

  it("keeps saved lot labels hidden only for taproom-only staff", async () => {
    const params = { searchParams: Promise.resolve({ location: "tap", count: "count" }) };
    expect((await TaproomPage(params)).props.model.receipt.lines[0].detail).not.toContain("LOT-797");
    pageState.roles = ["taproom", "brewer"];
    expect((await TaproomPage(params)).props.model.receipt.lines[0].detail).toContain("LOT-797");
  });

  it("#1117 a first saved count's receipt says in words that there is nothing to compare against", async () => {
    const recorded = (await TaproomPage({ searchParams: Promise.resolve({ location: "tap", count: "count" }) })).props.model.receipt.recorded;
    expect(recorded).toContain(". First count, so there is nothing to compare against.");
    expect(recorded).not.toContain("· first count");
  });

  it("reads invoice questions with the actual registry's union permission", async () => {
    pageState.roles = ["warehouse"];
    await InvoiceDetailPage({ params: Promise.resolve({ id: "invoice" }) });
    expect(pageState.calls).not.toContain("list_invoice_questions");
    pageState.roles = ["warehouse", "sales"]; pageState.calls = [];
    await InvoiceDetailPage({ params: Promise.resolve({ id: "invoice" }) });
    expect(pageState.calls).toContain("list_invoice_questions");
  });
});

// These exclusions deliberately mean a nonempty subset, not “holds this role”.
// Search, Today, lot labels and quiet hours share the taproom-only restriction;
// Locations and Water profiles instead use their destination's positive permission.
describe("role-only exclusions", () => {
  it("never treats an empty membership as an excluded staff member", () => {
    expect(onlyRoles([], ["taproom"])).toBe(false);
    expect(onlyRoles([], ["brewer"])).toBe(false);
  });

  it("accepts a nonempty subset and refuses any role outside the excluded set", () => {
    expect(onlyRoles(["taproom"], ["taproom", "brewer"])).toBe(true);
    expect(onlyRoles(["taproom", "brewer"], ["taproom", "brewer"])).toBe(true);
    expect(onlyRoles(["taproom", "sales"], ["taproom", "brewer"])).toBe(false);
    expect(hasAnyRole(["admin"], ["sales"])).toBe(false);
  });

  it("lifts taproom-only restrictions for every additional staff role", () => {
    expect(onlyRoles(["taproom"], ["taproom"])).toBe(true);
    for (const other of ["admin", "sales", "warehouse", "brewer"] as const) {
      expect(onlyRoles(["taproom", other], ["taproom"]), other).toBe(false);
    }
  });

  it("restores taproom+brewer search destinations and production Today permissions", () => {
    expect(searchDestinations(["taproom"], "batches")).toEqual([]);
    expect(searchDestinations(["taproom", "brewer"], "batches").map(item => item.href)).toEqual(["/batches"]);
    const roles: StaffRole[] = ["taproom", "brewer"];
    expect(canRun({ roles, breweryId: "brewery" } as Ctx, "get_today")).toBe(true);
    expect(defaultWorkKinds(roles)).toContain("batches");
  });

  it("keeps quiet-hours behavior in the shared persona view", () => {
    const screen = SCREENS.find(screen => screen.name === "My notification preferences")!;
    const render = (roles: StaffRole[]) => renderToStaticMarkup(createElement("div", null, asPersona(screen, { id: "taproom", roles, name: "Taproom staff", handle: "@taproom" }).body));
    expect(render(["taproom"])).not.toContain("Save my quiet hours");
    expect(render(["taproom", "brewer"])).toContain("Save my quiet hours");
  });

  it("reveals tracked lot labels in the shared count draft for taproom+brewer", () => {
    const render = (roles: StaffRole[]) => renderToStaticMarkup(createElement(WeeklyCountDraftView, {
      state: weeklyCount.draft!, roles, lotLabels: weeklyCount.lotLabels, timeZone: weeklyCount.timeZone,
    }));
    expect(render(["taproom"])).not.toContain("L-260901-HZ");
    expect(render(["taproom"])).toContain("Tracked worksheet row");
    expect(render(["taproom", "brewer"])).toContain("L-260901-HZ");
  });

  it("preserves admin correction permissions when admin is not the first role", () => {
    const render = (roles: StaffRole[]) => renderToStaticMarkup(createElement(WeeklyCountView, { model: { ...weeklyCount, roles }, draft: null }));
    expect(render(["taproom"])).not.toContain("Correct count");
    expect(render(["taproom", "admin"])).toContain("Correct count");
  });

  it("returns to Recipes until another role actually grants Catalog access", () => {
    expect(waterProfilesBack(["brewer"])).toEqual({ label: "Recipes", href: "/recipes" });
    expect(waterProfilesBack(["brewer", "taproom"])).toEqual({ label: "Recipes", href: "/recipes" });
    for (const other of ["admin", "sales", "warehouse"] as const) {
      expect(waterProfilesBack(["brewer", other])).toEqual({ label: "Catalog", href: "/catalog" });
    }
  });

  it("uses the registry gate for warehouse invoice questions and grants sales' union", () => {
    expect(getCommandDefinition("list_invoice_questions")).toBeDefined();
    expect(canRun({ roles: ["warehouse"], breweryId: "brewery" } as Ctx, "list_invoice_questions")).toBe(false);
    expect(canRun({ roles: ["warehouse", "sales"], breweryId: "brewery" } as Ctx, "list_invoice_questions")).toBe(true);
    expect(canRun({ roles: ["warehouse", "brewer"], breweryId: "brewery" } as Ctx, "list_invoice_questions")).toBe(false);
  });

  it("shows QuickBooks state and staff links only with admin or sales", () => {
    const invoice = { kind: "invoice", qbo_sync_status: "pushed", qbo_remote_state: "live", qbo_invoice_id: "34" } as const;
    const connection = { connected: true, connectionId: "connection", realmId: "realm" };
    const push = { connection_id: "connection", realm_id: "realm", qbo_entity_id: "34" };
    for (const excluded of ["warehouse", "brewer", "taproom"] as const) {
      expect(qboInvoicePresentation({ kind: "invoice", roles: [excluded], connected: true, syncStatus: "pending", localPaidCents: 0 }).actions).toEqual([]);
      expect(qboStaffInvoiceLink(invoice, [excluded], connection, push)).toBeNull();
      for (const allowed of ["sales", "admin"] as const) {
        expect(qboInvoicePresentation({ kind: "invoice", roles: [excluded, allowed], connected: true, syncStatus: "pending", localPaidCents: 0 }).actions).toEqual(["push"]);
        expect(qboStaffInvoiceLink(invoice, [excluded, allowed], connection, push)?.href).toContain("txnId=34");
      }
    }
    expect(qboStaffInvoiceLink(invoice, ["customer"], connection, push)).toBeNull();
  });
});
