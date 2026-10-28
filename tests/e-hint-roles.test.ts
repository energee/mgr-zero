// #904: static hint cards are notes; explicit errors remain assertive on the
// shared surfaces used by inventory and live adapters. QW24's always-mounted
// polite result regions retain their separate announcement contract.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecipeView } from "@/components/mgr/views/recipe";
import { PublicationResult, SyncFeedback } from "@/components/mgr/views/pos-controls";
import { cellarAdditionCitra, recipeHazyV4 } from "@/lib/mgr/fixtures/production";
import { E } from "@/components/mgr/e";
import { AccountInvitationsView } from "@/components/mgr/views/account-invitations";
import { AccountingView, DisconnectQuickBooksView, QboSyncView } from "@/components/mgr/views/accounting";
import { ChatDisconnectView, ChatHealthView, ChatSettingsView } from "@/components/mgr/views/chat";
import { DisconnectSquareView, PointOfSaleView } from "@/components/mgr/views/pos";
import { EntryView } from "@/components/mgr/views/entry";
import { FormatView } from "@/components/mgr/views/format";
import { toAccountingViewProps } from "@/lib/mgr/accounting-view";
import { toSetPasswordViewProps } from "@/lib/mgr/entry-view";
import { toFormatViewProps } from "@/lib/mgr/format-view";
import type { ChatHealth } from "@/lib/commands/chat";
import { CycleCountView } from "@/components/mgr/views/cycle-count";
import { PackagingMaterialActuals } from "@/components/mgr/views/packaging-materials";
import { cycleCountCans } from "@/lib/mgr/fixtures/purchasing";
import { CellarAdditionView } from "@/components/mgr/views/cellar-addition";
import { FormatRowsView } from "@/components/mgr/views/format-rows";
import { ChatLinkConsentView } from "@/components/mgr/views/chat";

type ExactCommand = Parameters<typeof PublicationResult>[0]["action"];
const command = (over: Partial<Record<string, unknown>>) =>
  ({ requestId: null, result: null, failure: null, busy: false, ...over }) as unknown as ExactCommand;
const noop = () => {};
/** The inner HTML of the one role="status" region, or null when there is none. */
const statusRegion = (html: string) => html.match(/<div role="status">([\s\S]*?)<\/div>/)?.[1] ?? null;

describe("hint roles", () => {
  it.each(["note", "info"] as const)("E.%s defaults to a non-live note and opts errors into alerts", kind => {
    const hint = renderToStaticMarkup(E[kind]("Static guidance"));
    expect(hint).toContain('role="note"');
    expect(hint).not.toContain('role="alert"');
    expect(hint).not.toContain("aria-live");
    const error = renderToStaticMarkup(E[kind]("Something failed", "alert"));
    expect(error).toContain('role="alert"');
    expect(error).not.toContain('role="note"');
  });

  // Read the rendered card, not source strings or an import that may be unused.
  const cards = (html: string, role: "note" | "alert") => [...html.matchAll(new RegExp(`<div\\b[^>]*role="${role}"[^>]*>([\\s\\S]*?)<\\/div>`, "g"))].map(match => match[1].replace(/<[^>]+>/g, "")).join(" · ");
  const health: ChatHealth = {
    installation: { id: "slack", workspace: "Fixture workspace", state: "active", scopes: [], quietStart: null, quietEnd: null, timezone: null, lastError: "credential_delete_failed" },
    destinations: [], queue: {}, linkedCount: 0, lastCallback: null, lastDelivery: null,
  };

  it("keeps invitation failures assertive without announcing the joining hint", () => {
    const html = renderToStaticMarkup(createElement(AccountInvitationsView, { invitations: [], error: "Invitation could not be accepted" }));
    expect(cards(html, "alert")).toBe("Invitation could not be accepted");
    expect(cards(html, "note")).toContain("Joining grants access");
  });

  it("keeps QuickBooks connection, sync and revocation failures assertive", () => {
    const model = toAccountingViewProps({ connected: false, connectionId: "11111111-1111-4111-8111-111111111111", state: "disconnected", realmLabel: null, lastError: "Reconnect required", remoteRevocationState: "unresolved" }, "America/New_York");
    const html = renderToStaticMarkup(createElement(AccountingView, { model, sync: createElement(QboSyncView, { status: {
      latest: { at: "Oct 16", operator: "Operator", completed: false, superseded: true }, latestFailure: { at: "Oct 15", operator: "Operator" }, lastSuccess: null, retryRequestId: null,
    } }) }));
    for (const error of ["Last connection error: Reconnect required", "could not confirm remote revocation", "Latest failed attempt", "saved batch was superseded"]) expect(cards(html, "alert")).toContain(error);
    // The staleness line is plain text in the sync row (#945): present, never announced.
    expect(html).toContain("Payment status may be stale");
    expect(cards(html, "alert")).not.toContain("Payment status may be stale");
    expect(cards(html, "note")).toContain("QuickBooks remains the accounting record");
    const disconnect = renderToStaticMarkup(createElement(DisconnectQuickBooksView, { status: "unresolved" }));
    expect(cards(disconnect, "alert")).toContain("did not confirm revocation");
    expect(cards(disconnect, "note")).toContain("Stops: invoice push");
  });

  it("keeps Square OAuth, connection and unresolved disconnect outcomes assertive", () => {
    const html = renderToStaticMarkup(createElement(PointOfSaleView, { model: { connected: false, merchant: "", state: "disconnected", oauthFailed: true, error: "Reconnect required" } }));
    expect(cards(html, "alert")).toContain("Square authorization was cancelled");
    expect(cards(html, "alert")).toContain("Last connection error: Reconnect required");
    expect(cards(html, "note")).toContain("Publish what the taproom can sell");
    for (const status of ["unresolved", "pending"] as const) {
      const disconnect = renderToStaticMarkup(createElement(DisconnectSquareView, { status }));
      expect(cards(disconnect, "alert")).toContain(status === "unresolved" ? "did not confirm revocation" : "outcome was not recorded");
      expect(cards(disconnect, "note")).toContain("Stops: menu publishing");
    }
  });

  it("keeps Slack OAuth, provider, missing channel and cleanup failures assertive", () => {
    const html = renderToStaticMarkup(createElement(ChatSettingsView, { health, timezone: "America/New_York", readingDueHours: 24, oauthError: true, fields: null, connection: null }));
    for (const error of ["Slack connection was cancelled", "Last provider error: credential delete failed", "No operations channel selected"]) expect(cards(html, "alert")).toContain(error);
    expect(cards(renderToStaticMarkup(createElement(ChatHealthView, { health, connection: null, disable: null })), "alert")).toContain("Last provider error: credential delete failed");
    const disconnect = renderToStaticMarkup(createElement(ChatDisconnectView, { cleanupPending: true }));
    expect(cards(disconnect, "alert")).toContain("Credential cleanup failed");
    expect(cards(disconnect, "note")).toContain("Stops: App Home");
  });

  it("keeps password submission and format sizing errors assertive", () => {
    const password = renderToStaticMarkup(createElement(EntryView, { model: toSetPasswordViewProps("operator@example.com", "same_password") }));
    expect(cards(password, "alert")).toContain("Choose a password different");
    const model = toFormatViewProps({ format: { id: "format", name: "Case", basis: "packaged", package_type: "can", units_per_case: 0, bbl_per_unit: 0 } });
    expect(cards(renderToStaticMarkup(createElement(FormatView, { model })), "alert")).toContain("Enter a whole number of containers");
  });

  it("keeps frozen counts and overdrawn packaging inputs assertive, not their previews", () => {
    const count = renderToStaticMarkup(createElement(CycleCountView, { model: cycleCountCans, frozen: true }));
    expect(cards(count, "alert")).toContain("No trustworthy response arrived");
    expect(cards(count, "note")).toContain(cycleCountCans.preview);
    for (const restoring of [false, true]) {
      const packaging = renderToStaticMarkup(createElement(PackagingMaterialActuals, {
        plan: { revision: "1", planned: [], sources: [], materials: [], lots: [] }, locations: [], bins: [], restoring,
        rows: [{ key: "row", materialId: "cans", locationId: "warehouse", binId: "shelf", lotId: null, used: "1", loss: "0", unused: "0" }],
      }));
      expect(cards(packaging, "alert")).toContain(restoring ? "Replacement use plus loss exceeds" : "Used plus loss exceeds");
      expect(cards(packaging, "note")).toContain("Unused returned is an observation");
    }
  });

  it("keeps cellar selection guidance quiet but an entered lot overdraw assertive", () => {
    const prompt = renderToStaticMarkup(createElement(CellarAdditionView, { model: { ...cellarAdditionCitra, lotId: "" } }));
    // The need is said once, as plain text beside Record addition, not in a card (#1481).
    expect(prompt).toContain("Still needed: a lot (Citra is lot-tracked).");
    expect(cards(prompt, "note")).toBe("");
    expect(cards(prompt, "alert")).toBe("");
    const overdraw = renderToStaticMarkup(createElement(CellarAdditionView, { model: { ...cellarAdditionCitra, qty: "41" } }));
    expect(cards(overdraw, "alert")).toContain("Only 40 lb of L-0790 on hand");
    const preview = renderToStaticMarkup(createElement(CellarAdditionView, { model: cellarAdditionCitra }));
    expect(cards(preview, "note")).toContain("Preview:");
    expect(cards(preview, "alert")).toBe("");
  });

  it("keeps format row validation and an unusable Slack link assertive", () => {
    const rows = renderToStaticMarkup(createElement(FormatRowsView, { kind: "components", rows: [{ id: "can", qty: "0" }], options: [{ id: "can", name: "Can" }], valid: false, onChange: noop, confirmClear: false, onConfirmClear: noop }));
    expect(cards(rows, "alert")).toContain("Choose a different item for each row");
    expect(cards(renderToStaticMarkup(createElement(ChatLinkConsentView, { intent: null })), "alert")).toContain("This link is missing, expired");
  });

  it("RecipeView renders Predicted inside a polite status region, not an alert", () => {
    const html = renderToStaticMarkup(createElement(RecipeView, { model: recipeHazyV4 }));
    expect(statusRegion(html)).toContain("Predicted: OG 15.2 °P");
    expect(html).not.toMatch(/role="alert"[^>]*>(?:(?!<\/div>)[\s\S])*Predicted:/);
  });

  it("RecipeView keeps the status region mounted before anything is predicted", () => {
    const html = renderToStaticMarkup(createElement(RecipeView, { model: { title: "New recipe", notes: "" }, controls: { set: noop, onSubmit: noop } }));
    expect(statusRegion(html)).toBe("");
  });

  it("a POS publication result is always mounted as status; a success fills it", () => {
    expect(statusRegion(renderToStaticMarkup(createElement(PublicationResult, { action: command({}), onRetry: noop, onCorrected: noop })))).toBe("");
    const html = renderToStaticMarkup(createElement(PublicationResult, {
      action: command({ requestId: "r1", result: { publication: { attemptId: "r1", status: "succeeded", errorCode: null } } }), onRetry: noop, onCorrected: noop,
    }));
    expect(statusRegion(html)).toContain("Published");
    expect(html).not.toContain('role="alert"');
  });

  it("a rejected POS publication stays an alert and leaves the status region empty", () => {
    const html = renderToStaticMarkup(createElement(PublicationResult, {
      action: command({ requestId: "r2", result: { publication: { attemptId: "r2", status: "rejected", errorCode: "version_mismatch" } } }), onRetry: noop, onCorrected: noop,
    }));
    expect(statusRegion(html)).toBe("");
    expect(html).toMatch(/role="alert"[\s\S]*r2/);
  });

  it("a completed sync is status; a failed sync is an alert", () => {
    const html = renderToStaticMarkup(createElement(SyncFeedback, { runs: [
      ["Catalog", command({ requestId: "c1", result: { locations: 1, variations: 2 } })],
      ["Sales", command({ requestId: "s1", failure: { kind: "definitive", message: "Forbidden" } })],
    ] }));
    expect(statusRegion(html)).toContain("Catalog sync complete · attempt c1");
    expect(statusRegion(html)).not.toContain("Sales");
    expect(html).toMatch(/role="alert"[\s\S]*Sales sync stopped · Forbidden/);
  });

  it("a superseded sync stays an alert", () => {
    const html = renderToStaticMarkup(createElement(SyncFeedback, { runs: [
      ["Catalog", command({ requestId: "c2", result: { synced: false, superseded: true } })],
    ] }));
    expect(statusRegion(html)).toBe("");
    expect(html).toMatch(/role="alert"[\s\S]*Catalog sync superseded/);
  });
});
