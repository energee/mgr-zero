import { expect, it } from "vitest";
import { toAccountingViewProps } from "../lib/mgr/accounting-view";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountingView, QboConnectionView, QboDefaultsView, DisconnectQuickBooksView } from "../components/mgr/views/accounting";

it("keeps disconnected and missing accounting facts distinct from configured defaults", () => {
  const model = toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null });
  expect(model.defaults).toBeUndefined();
  expect(model.missingEmails).toBeUndefined();
  expect(model.backHref).toBeUndefined();
  expect(model.connected).toBe(false);
  const recovery = toAccountingViewProps({ connected: false, state: "recovery_required", connectionId: "actual", realmLabel: "Actual company", lastError: "Refresh refused", allowAch: false, allowCard: true });
  expect(recovery.defaults).toEqual({ allowAch: false, allowCard: true });
  expect(recovery.reconnect).toBe(true);
  expect(recovery.canDisconnect).toBe(false);
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

it("does not call recovery-required disconnected or leak fixture paths", () => {
  const html = renderToStaticMarkup(createElement(DisconnectQuickBooksView, { connected: false, recoveryRequired: true }));
  expect(html).toContain("requires a connected state");
  expect(html).not.toContain("already disconnected");
  const model = toAccountingViewProps({ connected: false, state: "disconnected", realmLabel: null, lastError: null });
  const account = renderToStaticMarkup(createElement(AccountingView, { model, connection: null, defaults: null }));
  expect(account).toContain("Count unavailable");
  expect(account).not.toContain("Save push defaults");
  expect(account).not.toContain('href="/settings');
});
