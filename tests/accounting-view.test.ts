import { expect, it } from "vitest";
import { qboCompanyName, qboEnvironment, toAccountingViewProps } from "../lib/mgr/accounting-view";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountingView, QboConnectionView, QboDefaultsView, DisconnectQuickBooksView } from "../components/mgr/views/accounting";

it("names the company once and hides the self-renewing token expiry (#1509)", () => {
  const model = toAccountingViewProps({ connected: true, state: "connected", connectionId: "c1", realmLabel: "Test Company", realmId: "9341", lastError: null, accessExpiresAt: "2026-09-15T02:00:00Z" });
  const html = renderToStaticMarkup(createElement(AccountingView, { model, connection: null, defaults: null, sync: null }));
  expect(html.match(/Test Company/g)).toHaveLength(1);
  expect(html).toContain("9341");
  expect(html).not.toContain("expires");
  expect(html).not.toContain(">Access<");
});

it("keeps disconnected and missing accounting facts distinct from configured defaults", () => {
  const model = toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null });
  expect(model.defaults).toBeUndefined();
  expect(model.missingEmails).toBeUndefined();
  expect(toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null }, 3).missingEmails).toBe(3);
  expect(model.backHref).toBeUndefined();
  expect(model.connected).toBe(false);
  const recovery = toAccountingViewProps({ connected: false, state: "recovery_required", connectionId: "actual", realmLabel: "Actual company", lastError: "Refresh refused", allowAch: false, allowCard: true });
  expect(recovery.defaults).toEqual({ allowAch: false, allowCard: true });
  expect(recovery.reconnect).toBe(true);
  expect(recovery.canDisconnect).toBe(true);
});

it("preserves unavailable setup, errors, and explicit payment settings", () => {
  const connect = renderToStaticMarkup(createElement(QboConnectionView, { configured: false, error: "Authorization failed" }));
  expect(connect).toContain("disabled");
  expect(connect).toContain("Authorization failed");
  expect(connect).toContain('data-variant="irreversible"');
  // The admin cannot set server values, and MGR has no support channel to promise (#1151).
  expect(connect).toContain("QuickBooks isn’t turned on in MGR yet.");
  expect(connect).not.toContain("server connection values");
  expect(connect).not.toContain("support");
  const defaults = renderToStaticMarkup(createElement(QboDefaultsView, { allowAch: false, allowCard: true, disabled: true }));
  expect(defaults).toContain('aria-checked="false"');
  expect(defaults).toContain('aria-checked="true"');
  // A switch saves when tapped (#1509): there is no separate Save.
  expect(defaults).not.toContain("Save push defaults");
  // Matches OnlinePaymentsRow: turning both off affects new invoices only.
  expect(defaults).toContain("invoices pushed earlier keep theirs");
  expect(defaults).not.toContain("cannot pay online at all");
});

it("offers the disconnect action by default and does not leak fixture paths", () => {
  const html = renderToStaticMarkup(createElement(DisconnectQuickBooksView, { status: "available" }));
  expect(html).toContain("Disconnect QuickBooks");
  expect(html).not.toContain("already disconnected");
  const model = toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null });
  const account = renderToStaticMarkup(createElement(AccountingView, { model, connection: null, defaults: null }));
  expect(account).toContain("Count unavailable");
  expect(account).not.toContain("Save push defaults");
  expect(account).not.toContain('href="/settings');
});

it("reports portal-email presence without claiming delivery or blocking push", () => {
  const model = { ...toAccountingViewProps({ connected: false, state: "disconnected" as const, realmLabel: null, lastError: null }), missingEmails: 2, customersHref: "/customers?missingEmail=1" };
  const markup = renderToStaticMarkup(createElement(AccountingView, { model }));
  expect(markup).toContain("2 customers have no portal login email");
  expect(markup).toContain('href="/customers?missingEmail=1"');
  expect(markup).not.toContain("cannot be pushed");
});

it("offers portal-email Review only when the count is positive or unavailable (#1151)", () => {
  const base = toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null });
  const render = (missingEmails?: number) => renderToStaticMarkup(createElement(AccountingView, {
    model: { ...base, missingEmails, customersHref: "/customers?missingEmail=1" }, connection: null, defaults: null, sync: null,
  }));
  expect(render(0)).toContain("All customers have a portal login email");
  expect(render(0)).not.toContain(">Review<");
  expect(render(0)).not.toContain('href="/customers?missingEmail=1"');
  for (const count of [1, 2, undefined]) {
    expect(render(count)).toContain(">Review<");
    expect(render(count)).toContain('href="/customers?missingEmail=1"');
  }
});

it("names the connected company, keeps its id as a separate fact, and labels the QuickBooks environment", () => {
  const model = toAccountingViewProps({ connected: true, state: "connected", connectionId: "c1", realmLabel: "Test Company", realmId: "4620816365342151800", lastError: null }, undefined, "sandbox");
  expect(model.company).toBe("Test Company");
  expect(model.status).toBe("Connected · sandbox");
  expect(model.companyId).toBe("4620816365342151800");
  const html = renderToStaticMarkup(createElement(AccountingView, { model, connection: null, defaults: null, sync: null }));
  expect(html).toContain("Test Company");
  expect(html).toContain("Connected · sandbox");
  expect(html).toContain("4620816365342151800");
  // A label that is only the id (connected before CompanyName was stored) is not repeated as a name.
  expect(toAccountingViewProps({ connected: true, state: "connected", realmLabel: "4620816365342151800", realmId: "4620816365342151800", lastError: null }, undefined, "production").company).toBe("QuickBooks Online");
  expect(toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null }, undefined, "production").status).toBe("Not connected");
});

it("reads the QuickBooks environment from the configured API host", () => {
  expect(qboEnvironment("https://sandbox-quickbooks.api.intuit.com")).toBe("sandbox");
  expect(qboEnvironment("https://quickbooks.api.intuit.com")).toBe("production");
});

it("treats a realm-id label as no company name", () => {
  expect(qboCompanyName({ realmLabel: "Test Company", realmId: "4620816365342151800" })).toBe("Test Company");
  expect(qboCompanyName({ realmLabel: "4620816365342151800", realmId: "4620816365342151800" })).toBeNull();
  expect(qboCompanyName({ realmLabel: null })).toBeNull();
});

it("reads connection statuses, online payments and portal logins as sentences (#1151)", () => {
  const health = { connected: false, state: "disconnected" as const, realmLabel: null, lastError: null };
  const render = (model: ReturnType<typeof toAccountingViewProps>) => renderToStaticMarkup(createElement(AccountingView, { model, connection: null, sync: null }));
  expect(toAccountingViewProps({ ...health, state: "recovery_required", connectionId: "c1" }).status).toBe("Reconnect required");
  const disconnected = render(toAccountingViewProps(health, 0));
  expect(disconnected).toContain("Not connected");
  expect(disconnected).not.toContain("fail closed");
  // True whether QuickBooks was never connected, needs reconnecting, or is not turned on.
  expect(disconnected).toContain("Needs a QuickBooks connection");
  expect(disconnected).toContain("Not available");
  const recovery = render(toAccountingViewProps({ ...health, state: "recovery_required", connectionId: "c1" }));
  expect(recovery).toContain("Needs a QuickBooks connection");
  expect(recovery).not.toContain("Connect QuickBooks first");
  expect(disconnected).toContain("All customers have a portal login email");
  // The section heading names Push defaults; the locked card under it does not repeat it.
  expect(disconnected.match(/Push defaults/g)).toHaveLength(1);
  const connected = render(toAccountingViewProps({ ...health, connected: true, state: "connected", connectionId: "c1" }, 1));
  expect(connected).toContain("Through each invoice’s QuickBooks payment link");
  expect(connected).not.toContain("Not available");
  expect(connected).toContain("1 customer has no portal login email");
  // OnlinePaymentsRow: both options off means customers cannot pay new invoices online.
  const bothOff = render(toAccountingViewProps({ ...health, connected: true, state: "connected", connectionId: "c1", allowAch: false, allowCard: false }));
  expect(bothOff).toContain("Bank transfer and card are off for new invoices");
  expect(bothOff).toContain(">Off<");
  expect(bothOff).not.toContain("Through each invoice’s QuickBooks payment link");
  const achOnly = render(toAccountingViewProps({ ...health, connected: true, state: "connected", connectionId: "c1", allowAch: true, allowCard: false }));
  expect(achOnly).toContain("Through each invoice’s QuickBooks payment link");
});
