import { expect, it } from "vitest";
import { toQboSyncViewProps } from "@/lib/mgr/accounting-view";
it("formats all manual sync instants in the brewery time zone", () => {
  const at = "2026-09-28T01:30:45.123456+00:00";
  const model = toQboSyncViewProps({ latest: { at, operator: "a", completed: false },
    lastSuccess: { at, operator: "b" }, latestFailure: { at, operator: "a" },
    retryRequestId: "request", }, "America/New_York");
  expect(model.latest?.at).toBe("Sep 27, 2026, 9:30 PM");
  expect(model.lastSuccess?.at).toBe(model.latest?.at);
  expect(model.latestFailure?.at).toBe(model.latest?.at);
  expect(model.retryRequestId).toBe("request");
});
