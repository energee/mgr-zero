import { beforeEach, expect, it, vi } from "vitest";
import { Children, createElement, isValidElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoicesView } from "@/components/mgr/views/invoices";
import { AccountingView, QboConnectionView } from "@/components/mgr/views/accounting";
import { PointOfSaleView, ConnectSquareView } from "@/components/mgr/views/pos";
import { toAccountingViewProps } from "@/lib/mgr/accounting-view";
import { toPosMenuSetup } from "@/lib/mgr/pos-view";

const state = vi.hoisted(() => ({ configured: false, connectionId: undefined as string | undefined }));
vi.mock("@/lib/commands/all", () => ({}));
vi.mock("@/lib/brewery", () => {
  const brewery = { id: "brewery", roles: ["admin"], timeZone: "UTC" };
  return { getActiveBrewery: async () => brewery, requireAdminContext: async () => ({ brewery, ctx: {} }) };
});
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({}) }));
vi.mock("@/lib/qbo", () => ({ isQboConfigured: () => state.configured }));
vi.mock("@/lib/pos", () => ({ isSquareConfigured: () => state.configured }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: async (name: string) => {
  if (name === "get_qbo_connection" || name === "get_pos_integration_health") return {
    connected: false, connectionId: state.connectionId, state: "disconnected", realmLabel: null, merchantLabel: null, lastError: null,
  };
  if (name === "get_qbo_sync_status") return { latest: null, lastSuccess: null, latestFailure: null, retryRequestId: null };
  if (name === "list_invoices") return { rows: [], nextCursor: null };
  throw new Error(name);
} }));
import InvoicesPage from "@/app/(app)/invoices/page";
import PosPage from "@/app/(app)/settings/pos/page";
import SquareConnectorPage from "@/app/(app)/settings/pos/connector/page";

beforeEach(() => { state.configured = false; state.connectionId = undefined; });

it("gates invoice navigation using deployment configuration, not Admin permission", async () => {
  const page = await InvoicesPage({ searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(page);
  expect(html).toContain("QuickBooks isn’t turned on in MGR yet.");
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Connect<\/button>/);
  expect(html).not.toContain('href="/settings/accounting/connect"');
  expect(html).not.toContain("reconnected");
  expect(html).not.toContain("stale");
  state.configured = true;
  expect(renderToStaticMarkup(await InvoicesPage({ searchParams: Promise.resolve({}) }))).toContain('href="/settings/accounting/connect"');
});

it("gates Square navigation before the connect page", async () => {
  const html = renderToStaticMarkup(await PosPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("Square isn’t turned on in MGR yet.");
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Connect<\/button>/);
  expect(html).not.toContain('href="/settings/pos/connect"');
  state.configured = true;
  expect(renderToStaticMarkup(await PosPage({ searchParams: Promise.resolve({}) }))).toContain('href="/settings/pos/connect"');
});

it("uses the same unavailable reasons at both entry and final Connect controls", () => {
  const qbo = renderToStaticMarkup(createElement(QboConnectionView, { configured: false }));
  const square = renderToStaticMarkup(createElement(ConnectSquareView, { configured: false }));
  expect(qbo).toContain("QuickBooks isn’t turned on in MGR yet.");
  expect(square).toContain("Square isn’t turned on in MGR yet.");
  expect(qbo).toContain("disabled");
  expect(square).toContain("disabled");
});

it("warns about stale QuickBooks payments only with an actual previous connection", async () => {
  state.configured = true;
  state.connectionId = "previous-connection";
  expect(renderToStaticMarkup(await InvoicesPage({ searchParams: Promise.resolve({}) }))).toContain("Payment status may be stale until QuickBooks is reconnected and synced.");
  const model = toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null }, "UTC");
  const draw = (reconnect: boolean) => renderToStaticMarkup(createElement(AccountingView, { model: { ...model, reconnect }, sync: createElement("span", null, "Sync QuickBooks · Payment status may be stale") }));
  expect(draw(false)).not.toContain("stale");
  expect(draw(false)).not.toContain("Sync QuickBooks");
  expect(draw(true)).toContain("Sync QuickBooks");
});

it("does not describe a never-connected Square seller as a reconnect", () => {
  expect(toPosMenuSetup({ admin: false, connected: false, observed: 0 }).description).toBe("Ask an admin to connect Square.");
  expect(renderToStaticMarkup(createElement(ConnectSquareView))).not.toContain("Reconnect Square");
  expect(renderToStaticMarkup(createElement(ConnectSquareView, { reconnect: true }))).toContain("Reconnect Square");
});

it("keeps Admin-only guidance distinct from an integration that is unavailable", () => {
  const connection = { connected: false, detail: "Not connected", canConnect: false, configured: false };
  const html = renderToStaticMarkup(createElement(InvoicesView, { rows: [], connection }));
  expect(html).toContain("QuickBooks isn’t turned on in MGR yet.");
  expect(html).not.toContain("Admin must connect");
});

it("mounts the real Point of sale page behind the connector sheet", async () => {
  const page = await SquareConnectorPage();
  const children = Children.toArray(page.props.children);
  expect(children.some(child => isValidElement(child) && child.type === PosPage)).toBe(true);
});

it("does not replace a healthy connection with an unavailable Connect action", () => {
  const model: ComponentProps<typeof PointOfSaleView>["model"] = { connected: true, merchant: "Verified seller", state: "Connected" };
  const html = renderToStaticMarkup(createElement(PointOfSaleView, { model }));
  expect(html).toContain("Verified seller");
  expect(html).toContain("Disconnect");
  expect(html).not.toContain("isn’t turned on");
});
