// Which disconnect a Square or QuickBooks connection admits, and what the shared views say about it (#620).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { disconnectStatus } from "../lib/mgr/integration-disconnect";
import { DisconnectSquareView, PointOfSaleView } from "../components/mgr/views/pos";
import { DisconnectQuickBooksView } from "../components/mgr/views/accounting";

it("separates an existing connection from a healthy one", () => {
  expect(disconnectStatus({ state: "disconnected" })).toBe("disconnected");
  expect(disconnectStatus({ connectionId: "c", state: "connected", remoteRevocationState: "not_requested" })).toBe("available");
  expect(disconnectStatus({ connectionId: "c", state: "recovery_required", remoteRevocationState: "not_requested" })).toBe("available");
  expect(disconnectStatus({ connectionId: "c", state: "recovery_required", remoteRevocationState: "pending" })).toBe("pending");
  expect(disconnectStatus({ connectionId: "c", state: "recovery_required", remoteRevocationState: "unresolved" })).toBe("unresolved");
  expect(disconnectStatus({ connectionId: "c", state: "disconnected", remoteRevocationState: "unresolved" })).toBe("unresolved");
  expect(disconnectStatus({ connectionId: "c", state: "disconnected", remoteRevocationState: "confirmed" })).toBe("disconnected");
});

it("never calls a retained Square recovery connection disconnected", () => {
  const html = (status: Parameters<typeof DisconnectSquareView>[0]["status"]) => renderToStaticMarkup(createElement(DisconnectSquareView, { status }));
  expect(html("available")).toContain("Disconnect Square");
  expect(html("available")).toContain("asks Square to revoke");
  expect(html("unresolved")).toContain("did not confirm");
  expect(html("unresolved")).not.toContain("already disconnected");
  expect(html("unresolved")).not.toContain("<button");
  expect(html("pending")).not.toContain("already disconnected");
  expect(html("disconnected")).toContain("already disconnected");
});

it("offers the QuickBooks disconnect in recovery and reports an unconfirmed revocation", () => {
  const html = (status: Parameters<typeof DisconnectQuickBooksView>[0]["status"]) => renderToStaticMarkup(createElement(DisconnectQuickBooksView, { status }));
  expect(html("available")).toContain("Disconnect QuickBooks</button>");
  expect(html("available")).toContain("asks QuickBooks to revoke");
  expect(html("unresolved")).toContain("did not confirm");
  expect(html("unresolved")).not.toContain("<button");
  expect(html("disconnected")).toContain("already disconnected");
});

it("links a recovery-state Square connection to its disconnect", () => {
  const html = renderToStaticMarkup(createElement(PointOfSaleView, {
    model: { connected: false, canDisconnect: true, merchant: "Square seller", state: "recovery required", locations: "", lastSync: "" },
    paths: { disconnect: "/settings/pos/disconnect", connect: "/settings/pos/connect" },
  }));
  expect(html).toContain('href="/settings/pos/disconnect"');
  expect(html).toContain('href="/settings/pos/connect"');
});
