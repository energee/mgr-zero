import { expect, it } from "vitest";
import { qboCompanyName, qboEnvironment, toAccountingViewProps } from "../lib/mgr/accounting-view";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountingView, QboConnectionView, QboDefaultsView, DisconnectQuickBooksView } from "../components/mgr/views/accounting";

it("dates the token expiry by the brewery's day, not its UTC prefix (#991)", () => {
  const model = toAccountingViewProps({ connected: true, state: "connected", connectionId: "c1", realmLabel: "Test Company", lastError: null, accessExpiresAt: "2026-09-15T02:00:00Z" }, "America/New_York");
  expect(model.access).toBe("renews automatically · current token expires Sep 14, 2026");
});

it("keeps disconnected and missing accounting facts distinct from configured defaults", () => {
  const model = toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null }, "America/New_York");
  expect(model.defaults).toBeUndefined();
  expect(model.missingEmails).toBeUndefined();
  expect(toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null }, "America/New_York", 3).missingEmails).toBe(3);
  expect(model.backHref).toBeUndefined();
  expect(model.connected).toBe(false);
  const recovery = toAccountingViewProps({ connected: false, state: "recovery_required", connectionId: "actual", realmLabel: "Actual company", lastError: "Refresh refused", allowAch: false, allowCard: true }, "America/New_York");
  expect(recovery.defaults).toEqual({ allowAch: false, allowCard: true });
  expect(recovery.reconnect).toBe(true);
  expect(recovery.canDisconnect).toBe(true);
});

it("preserves unavailable setup, errors, and explicit payment settings", () => {
  const connect = renderToStaticMarkup(createElement(QboConnectionView, { configured: false, error: "Authorization failed" }));
  expect(connect).toContain("disabled");
  expect(connect).toContain("Authorization failed");
  expect(connect).toContain('data-variant="irreversible"');
  // The admin cannot set server values; the copy names who can turn QuickBooks on (#1151).
  expect(connect).toContain("Contact MGR support");
  expect(connect).not.toContain("server connection values");
  const defaults = renderToStaticMarkup(createElement(QboDefaultsView, { allowAch: false, allowCard: true, disabled: true }));
  expect(defaults).toContain('aria-checked="false"');
  expect(defaults).toContain('aria-checked="true"');
  expect(defaults).toContain("Save push defaults");
});

it("offers the disconnect action by default and does not leak fixture paths", () => {
  const html = renderToStaticMarkup(createElement(DisconnectQuickBooksView, { status: "available" }));
  expect(html).toContain("Disconnect QuickBooks");
  expect(html).not.toContain("already disconnected");
  const model = toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null }, "America/New_York");
  const account = renderToStaticMarkup(createElement(AccountingView, { model, connection: null, defaults: null }));
  expect(account).toContain("Count unavailable");
  expect(account).not.toContain("Save push defaults");
  expect(account).not.toContain('href="/settings');
});

it("reports portal-email presence without claiming delivery or blocking push", () => {
  const model = { ...toAccountingViewProps({ connected: false, state: "disconnected" as const, realmLabel: null, lastError: null }, "America/New_York"), missingEmails: 2, customersHref: "/customers?missingEmail=1" };
  const markup = renderToStaticMarkup(createElement(AccountingView, { model }));
  expect(markup).toContain("2 customers have no portal login email");
  expect(markup).toContain('href="/customers?missingEmail=1"');
  expect(markup).not.toContain("cannot be pushed");
});

it("names the connected company, keeps its id as a separate fact, and labels the QuickBooks environment", () => {
  const model = toAccountingViewProps({ connected: true, state: "connected", connectionId: "c1", realmLabel: "Test Company", realmId: "4620816365342151800", lastError: null }, "America/New_York", undefined, "sandbox");
  expect(model.company).toBe("Test Company");
  expect(model.status).toBe("Connected · sandbox");
  expect(model.companyId).toBe("4620816365342151800");
  const html = renderToStaticMarkup(createElement(AccountingView, { model, connection: null, defaults: null, sync: null }));
  expect(html).toContain("Test Company");
  expect(html).toContain("Connected · sandbox");
  expect(html).toContain("4620816365342151800");
  // A label that is only the id (connected before CompanyName was stored) is not repeated as a name.
  expect(toAccountingViewProps({ connected: true, state: "connected", realmLabel: "4620816365342151800", realmId: "4620816365342151800", lastError: null }, "America/New_York", undefined, "production").company).toBe("QuickBooks Online");
  expect(toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null }, "America/New_York", undefined, "production").status).toBe("Not connected");
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
  expect(toAccountingViewProps({ ...health, state: "recovery_required", connectionId: "c1" }, "America/New_York").status).toBe("Reconnect required");
  const disconnected = render(toAccountingViewProps(health, "America/New_York", 0));
  expect(disconnected).toContain("Not connected");
  expect(disconnected).not.toContain("fail closed");
  expect(disconnected).toContain("Connect QuickBooks first");
  expect(disconnected).toContain("Not available");
  expect(disconnected).toContain("All customers have a portal login email");
  // The section heading names Push defaults; the locked card under it does not repeat it.
  expect(disconnected.match(/Push defaults/g)).toHaveLength(1);
  const connected = render(toAccountingViewProps({ ...health, connected: true, state: "connected", connectionId: "c1" }, "America/New_York", 1));
  expect(connected).toContain("Through each invoice’s QuickBooks payment link");
  expect(connected).not.toContain("Not available");
  expect(connected).toContain("1 customer has no portal login email");
});
