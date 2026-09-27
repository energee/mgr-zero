import { expect, it } from "vitest";
import { batchesFromQuery } from "@/lib/mgr/batches-view";
import { toPackagingRunsViewProps } from "@/lib/mgr/packaging-runs-view";
import { canRecordBrewDay } from "@/lib/mgr/brew-day-view";
import { brewDayHazy } from "@/lib/mgr/fixtures/production";

it("retains cancelled plans as history without offering physical work", () => {
  const batch = { id: "cancelled", batch_no: 7, planned_on: "2026-09-28", planned_bbl: 10, brewed_on: null, closed_at: null, cancelled_at: "2026-09-27", brand_name: null, recipe_name: null, vessel_name: null };
  const batches = batchesFromQuery([batch], []);
  expect(batches.planned).toEqual([]);
  expect(batches.cancelled?.[0]).toMatchObject({ key: "cancelled", verb: "Open" });
  const runs = toPackagingRunsViewProps([{ ...batch, run_no: 4, started_at: null, qty_planned: 12 }], "UTC", id => `/packaging/${id}`);
  expect(runs.upcoming).toEqual([]);
  expect(runs.recent[0]).toMatchObject({ verb: "Open", detail: expect.stringContaining("Cancelled") });
  expect(canRecordBrewDay({ ...brewDayHazy, cancelledAt: "2026-09-27" })).toBe(false);
});

it("shares plan controls across inventory and live views and hides them for cancelled work", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { BrewDayView } = await import("@/components/mgr/views/brew-day");
  const { ClosePackagingRunView } = await import("@/components/mgr/views/close-packaging-run");
  const { PlanActions, PackagingSource } = await import("@/components/mgr/views/plan-actions");
  const { readFileSync } = await import("node:fs");
  const controls = renderToStaticMarkup(createElement(PlanActions, { plannedOn: "2026-09-28", busy: true, error: "Plan already started" }));
  expect(controls).toContain("Plan already started");
  expect(controls).toContain("disabled");
  expect(renderToStaticMarkup(createElement(PackagingSource, { sourcePicked: true, busy: true, error: "Tank emptied" }))).toContain("Tank emptied");
  const sourceWrapper = readFileSync("app/(app)/packaging/[id]/run-actions.tsx", "utf8");
  expect(sourceWrapper.match(/<PackagingSource/g)).toHaveLength(2);
  for (const element of [
    createElement(BrewDayView, { model: { ...brewDayHazy, cancelledAt: "2026-09-27" } }),
    createElement(ClosePackagingRunView, { model: { title: "Run", plannedOn: "2026-09-28", planEditable: true, cancelledAt: "2026-09-27" } }),
  ]) {
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Cancelled");
    expect(html).not.toContain("Cancel plan");
    expect(html).not.toContain("Reschedule");
    expect(html).not.toContain("Record brew day");
    expect(html).not.toContain("Close packaging run");
  }
  expect(readFileSync("app/(app)/plan-actions.tsx", "utf8")).toContain("<PlanActions");
  for (const file of ["components/mgr/views/brew-day.tsx", "components/mgr/views/close-packaging-run.tsx"]) expect(readFileSync(file, "utf8")).toContain("<PlanActions");
});
