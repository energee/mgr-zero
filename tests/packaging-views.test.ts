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
import { toRepackViewProps } from "../lib/mgr/repack-view";
import { toSchedulePackagingRunViewProps } from "../lib/mgr/schedule-packaging-run-view";

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
    expect(schedule.props.model).toEqual(toSchedulePackagingRunViewProps(schedulePackagingRun));
    expect(repack.type).toBe(RepackView);
    expect(repack.props.model).toEqual(toRepackViewProps(repackCase));
  });

  it("keeps fixture actions inert and explicit null slots empty", () => {
    const runs = htmlOf(createElement(PackagingRunsView, { model: toPackagingRunsViewProps(packagingRuns) }));
    expect(runs).not.toMatch(/href="\/packaging/);
    expect(htmlOf(createElement(SchedulePackagingRunView, { model: schedulePackagingRun, form: null }))).toBe("<div></div>");
    expect(htmlOf(createElement(RepackView, { model: repackCase, form: null }))).toBe("<div></div>");
  });

  it("the live list mounts PackagingRunsView and slots both controlled forms", () => {
    const page = readFileSync("app/(app)/packaging/page.tsx", "utf8");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/packaging-runs"/);
    expect(page).toMatch(/<PackagingRunsView\b/);
    expect(page).toMatch(/<ScheduleRunForm\b/);
    expect(page).toMatch(/<RepackForm\b/);
    expect(page).not.toMatch(/\bE\./);
  });
});
