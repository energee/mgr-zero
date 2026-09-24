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
import { toPackagingRunsViewProps } from "../lib/mgr/packaging-runs-view";
const screen = (name: string) => SCREENS.find((entry) => entry.name === name)!;
const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("packaging views", () => {
  it("mounts shared views for all three inventory records", () => {
    const runs = screen("Packaging runs").body as { type: unknown; props: { model: unknown } };
    const schedule = screen("Schedule packaging run").body as { type: unknown; props: { model: unknown } };
    const repack = screen("Repack").body as { type: unknown; props: { model: unknown } };

    expect(isValidElement(runs)).toBe(true);
    expect(runs.type).toBe(PackagingRunsView);
    expect(runs.props.model).toEqual(toPackagingRunsViewProps(packagingRuns));
    expect(schedule.type).toBe(SchedulePackagingRunView);
    expect(schedule.props.model).toEqual(schedulePackagingRun);
    const repackView = (repack.props as unknown as { children: [{ type: unknown; props: { model: unknown } }] }).children[0];
    expect(repackView.type).toBe(RepackView);
    expect(repackView.props.model).toEqual(repackCase);
  });

  it("keeps fixture actions inert and explicit null slots empty", () => {
    const runs = htmlOf(createElement(PackagingRunsView, { model: toPackagingRunsViewProps(packagingRuns) }));
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
    }]).recent;
    expect(recent.detail).toMatch(/^closed Sep 4, 2026/);
    expect(recent.detail).not.toContain("2026-09-01");
  });
});
