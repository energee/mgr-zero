import { readFileSync } from "node:fs";
import { PlanActions, PackagingSourcePicker } from "@/components/mgr/views/plan-actions";
import { ClosePackagingRunView } from "@/components/mgr/views/close-packaging-run";
import { BrewDayView } from "@/components/mgr/views/brew-day";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { expect, it } from "vitest";
import { batchesFromQuery } from "@/lib/mgr/batches-view";
import { toPackagingRunsViewProps } from "@/lib/mgr/packaging-runs-view";
import { brewDayHazy } from "@/lib/mgr/fixtures/production";

it("retains cancelled plans as history without offering physical work", () => {
  const batch = { id: "cancelled", batch_no: 7, planned_on: "2026-09-28", planned_bbl: 10, brewed_on: null, closed_at: null, cancelled_at: "2026-09-27", brand_name: null, recipe_name: null, vessel_name: null };
  const batches = batchesFromQuery([batch], []);
  expect(batches.planned).toEqual([]);
  expect(batches.cancelled?.[0]).toMatchObject({ key: "cancelled", verb: "Open" });
  const runs = toPackagingRunsViewProps([{ ...batch, run_no: 4, started_at: null, qty_planned: 12 }], "UTC", id => `/packaging/${id}`);
  expect(runs.upcoming).toEqual([]);
  expect(runs.recent[0]).toMatchObject({ verb: "Open", detail: expect.stringContaining("Cancelled") });
});

it("shares plan controls across inventory and live views and hides them for cancelled work", () => {
  const controls = renderToStaticMarkup(createElement(PlanActions, { plannedOn: "2026-09-28", busy: true, error: "Plan already started" }));
  expect(controls).toContain("Plan already started");
  expect(controls).toContain("disabled");
  expect(renderToStaticMarkup(createElement(PackagingSourcePicker, { occupancies: [], busy: true, error: "Tank emptied" }))).toContain("Tank emptied");
  const sourceWrapper = readFileSync("app/(app)/packaging/[id]/run-actions.tsx", "utf8");
  expect(sourceWrapper.match(/<PackagingSourcePicker/g)).toHaveLength(1);
  for (const element of [
    createElement(BrewDayView, { model: { ...brewDayHazy, cancelled: true }, planActions: createElement(PlanActions, { plannedOn: "2026-09-28" }) }),
    createElement(ClosePackagingRunView, { model: { title: "Run", plannedOn: "2026-09-28", cancelled: true }, planActions: createElement(PlanActions, { plannedOn: "2026-09-28" }) }),
  ]) {
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Cancelled");
    expect(html).not.toContain("Cancel plan");
    expect(html).not.toContain("Reschedule");
    expect(html).not.toContain("Record brew day");
    expect(html).not.toContain("Close packaging run");
  }
  expect(readFileSync("app/(app)/plan-actions.tsx", "utf8")).toContain("<PlanActions");
  // Inventory frames pass the same PlanActions the live pages bind.
  expect(readFileSync("components/mgr/screens.tsx", "utf8").match(/planActions=\{<PlanActions /g)).toHaveLength(2);
});
