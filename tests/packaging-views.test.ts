import { readFileSync } from "node:fs";
import { isValidElement, type ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { PackagingRunsView } from "../components/mgr/views/packaging-runs";
import { RepackView } from "../components/mgr/views/repack";
import { SchedulePackagingRunView } from "../components/mgr/views/schedule-packaging-run";
import { packagingRuns, repackCase, schedulePackagingRun } from "../lib/mgr/fixtures/packaging";
import { DEMO_TIME_ZONE } from "../lib/mgr/fixtures/settings";
import { toPackagingRunsViewProps } from "../lib/mgr/packaging-runs-view";
import { toSchedulePackagingRunView } from "../lib/mgr/schedule-packaging-run-view";
const screen = (name: string) => SCREENS.find((entry) => entry.name === name)!;
const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("packaging views", () => {
  it("mounts shared views for all three inventory records", () => {
    const runs = screen("Packaging runs").body as { type: unknown; props: { model: unknown } };
    const schedule = screen("Schedule packaging run").body as { type: unknown; props: { model: unknown } };
    const repack = screen("Repack").body as { type: unknown; props: { model: unknown } };

    expect(isValidElement(runs)).toBe(true);
    expect(runs.type).toBe(PackagingRunsView);
    expect(runs.props.model).toEqual(toPackagingRunsViewProps(packagingRuns, DEMO_TIME_ZONE));
    expect(schedule.type).toBe(SchedulePackagingRunView);
    expect(schedule.props.model).toEqual(schedulePackagingRun);
    const repackView = (repack.props as unknown as { children: [{ type: unknown; props: { model: unknown } }] }).children[0];
    expect(repackView.type).toBe(RepackView);
    expect(repackView.props.model).toEqual(repackCase);
  });

  it("keeps fixture actions inert and explicit null slots empty", () => {
    const runs = htmlOf(createElement(PackagingRunsView, { model: toPackagingRunsViewProps(packagingRuns, DEMO_TIME_ZONE) }));
    expect(runs).toMatch(/>Packaging</);
    expect(runs).not.toMatch(/href="\/packaging/);
    expect(htmlOf(createElement(SchedulePackagingRunView, { model: schedulePackagingRun }))).toMatch(/Save run plan/);
    expect(htmlOf(createElement(RepackView, { model: repackCase, footer: null }))).not.toMatch(/Record repack/);
  });

  it("the live list mounts PackagingRunsView and slots both controlled forms", () => {
    const page = readFileSync("app/(app)/packaging/page.tsx", "utf8");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/packaging-runs"/);
    expect(page).toMatch(/<PackagingRunsView\b/);
    expect(page).toMatch(/<ScheduleRunForm\b/);
    const form = readFileSync("app/(app)/packaging/schedule-run-form.tsx", "utf8");
    expect(form).toMatch(/<SchedulePackagingRunView\b/);
    expect(page).toMatch(/<RepackForm\b/);
    const repackForm = readFileSync("app/(app)/packaging/repack-form.tsx", "utf8");
    expect(repackForm).toMatch(/<RepackView\b/);
    expect(repackForm).toMatch(/toRepackView\(/);
    expect(repackForm).not.toMatch(/Child qty|childSkuId, setChildSkuId/);
    expect(page).not.toMatch(/\bE\./);
  });

  it("dates a closed run by when it closed, not when it was planned (#439)", () => {
    const [recent] = toPackagingRunsViewProps([{
      id: "r", run_no: 7, planned_on: "2026-09-01", started_at: "2026-09-03T15:00:00Z", closed_at: "2026-09-04T18:30:00Z",
      brand_name: "Pils", vessel_name: "FV1", qty_planned: 10,
    }], DEMO_TIME_ZONE).recent;
    expect(recent.detail).toMatch(/^closed Sep 4, 2026/);
    expect(recent.detail).not.toContain("2026-09-01");
  });

  it("builds the live Schedule run model from the page's reads, gating what they cannot say", () => {
    const data = {
      brands: [{ id: "b1", name: "Pils" }, { id: "b2", name: "Stout" }],
      occupancies: [{ occupancy_id: "o1", vessel_name: "FV1", brand_name: "Pils", batch_no: 12, bbl: 20 }],
      skus: [
        { id: "s1", name: "Pils ½ bbl", brand_id: "b1", format_volume: { bbl_per_unit: 0.5 } },
        { id: "s2", name: "Pils case", brand_id: "b1", format_volume: null },
        { id: "s3", name: "Stout ½ bbl", brand_id: "b2", format_volume: { bbl_per_unit: 0.5 } },
      ],
    };
    const empty = toSchedulePackagingRunView(data, { brandId: "", occupancyId: "", plannedOn: "", qty: {} });
    expect(empty.outputs).toEqual([]);
    expect(empty.sourceOptions[0]).toEqual({ value: "", label: "No source yet" });
    expect(empty.source).toBe("");
    expect(empty.leftInSource).toBeUndefined();
    // No shortfall read exists, so the model never claims a materials table.
    expect(empty.materials).toBeUndefined();

    const model = toSchedulePackagingRunView(data, { brandId: "b1", occupancyId: "o1", plannedOn: "2026-10-01", qty: { s1: "10", s3: "4" } });
    expect(model.outputs.map((o) => o.key)).toEqual(["s1", "s2"]);
    expect(model.outputs[0]).toEqual({ key: "s1", title: "Pils ½ bbl", detail: "5 bbl", qty: "10" });
    expect(model.outputs[1].detail).toBe("");
    expect(model.source).toBe("FV1 · Pils");
    expect(model.sourceDetail).toBe("B-0012 · 20 bbl");
    expect(model).toMatchObject({ leftLabel: "Left in FV1", leftInSource: "15 bbl" });
    // A planned SKU with no known barrels per unit leaves the remainder unknown, not guessed.
    expect(toSchedulePackagingRunView(data, { brandId: "b1", occupancyId: "o1", plannedOn: "", qty: { s2: "3" } }).leftInSource).toBeUndefined();
  });
});
