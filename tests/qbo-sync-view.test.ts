import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QboSyncView } from "@/components/mgr/views/accounting";

it("keeps last success distinct from a newer failed attempt and offers the saved retry", () => {
  const html = renderToStaticMarkup(createElement(QboSyncView, { status: {
    latest: { at: "2026-09-28T12:00:00Z", operator: "buyer@example.test", completed: false },
    lastSuccess: { at: "2026-09-27T12:00:00Z", operator: "admin@example.test" },
    latestFailure: { at: "2026-09-28T12:01:00Z", operator: "buyer@example.test" },
    retryRequestId: "saved-request",
  } }));
  expect(html).toContain("Last successful sync");
  expect(html).toContain("admin@example.test");
  expect(html).toContain("buyer@example.test");
  expect(html).toContain("Sync not completed");
  expect(html).toContain("Retry saved sync");
  expect(html).toContain("Payment status may be stale");
});
it("does not invent a successful reconciliation before the first completed batch", () => {
  const html = renderToStaticMarkup(createElement(QboSyncView, { status: { latest: null, lastSuccess: null, latestFailure: null, retryRequestId: null } }));
  expect(html).toContain("No successful sync recorded");
});

it.each([{ completed: true }, { completed: false, superseded: true }])("keeps resolved failure history factual without obsolete retry instructions: %j", (latest) => {
  const html = renderToStaticMarkup(createElement(QboSyncView, { status: {
    latest: { at: "Sep 28, 2026, 8:00 AM", operator: "admin@example.test", ...latest },
    lastSuccess: { at: "Sep 27, 2026, 8:00 AM", operator: "admin@example.test" },
    latestFailure: { at: "Sep 27, 2026, 9:00 AM", operator: "admin@example.test" },
    retryRequestId: null,
  } }));
  expect(html).toContain("Latest failed attempt");
  expect(html).toContain("Sep 27, 2026, 9:00 AM");
  expect(html).not.toContain("Retry the saved batch");
  expect(html).not.toContain("reconnect QuickBooks");
});
