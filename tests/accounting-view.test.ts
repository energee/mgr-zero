import { expect, it } from "vitest";
import { qboCompanyName, qboEnvironment, toAccountingViewProps } from "../lib/mgr/accounting-view";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountingView, QboConnectionView, QboDefaultsView, DisconnectQuickBooksView } from "../components/mgr/views/accounting";

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
  const defaults = renderToStaticMarkup(createElement(QboDefaultsView, { allowAch: false, allowCard: true, disabled: true }));
  expect(defaults).toContain('aria-checked="false"');
  expect(defaults).toContain('aria-checked="true"');
  expect(defaults).toContain("Save push defaults");
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
  expect(markup).toContain("2 · no portal login email");
  expect(markup).toContain('href="/customers?missingEmail=1"');
  expect(markup).not.toContain("cannot be pushed");
});

it("names the connected company, keeps its id as a separate fact, and labels the QuickBooks environment", () => {
  const model = toAccountingViewProps({ connected: true, state: "connected", connectionId: "c1", realmLabel: "Test Company", realmId: "4620816365342151800", lastError: null }, undefined, "sandbox");
  expect(model.company).toBe("Test Company");
  expect(model.status).toBe("connected · sandbox");
  expect(model.companyId).toBe("4620816365342151800");
  const html = renderToStaticMarkup(createElement(AccountingView, { model, connection: null, defaults: null, sync: null }));
  expect(html).toContain("Test Company");
  expect(html).toContain("connected · sandbox");
  expect(html).toContain("4620816365342151800");
  // A label that is only the id (connected before CompanyName was stored) is not repeated as a name.
  expect(toAccountingViewProps({ connected: true, state: "connected", realmLabel: "4620816365342151800", realmId: "4620816365342151800", lastError: null }, undefined, "production").company).toBe("QuickBooks Online");
  expect(toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null }, undefined, "production").status).toBe("disconnected");
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
