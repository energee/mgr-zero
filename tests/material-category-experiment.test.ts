// tests/material-category-experiment.test.ts — safety of the material kind experiment CLI and the shape of its synthetic cases.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MATERIAL_CATEGORIES } from "@/lib/mgr/enums";
import { materialCategoryQuestion } from "@/lib/mgr/material-category-suggestion";
import cases from "../scripts/material-category-cases.json";
import holdout from "../scripts/material-category-holdout.json";

const root = fileURLToPath(new URL("../", import.meta.url));

function runExperiment(...args: string[]) {
  return spawnSync("bun", ["scripts/experiment-material-category.ts", ...args], {
    cwd: root,
    env: { ...process.env, AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "", VERCEL: "", TYPESAFE_API_KEY: "" },
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("material kind experiment CLI safety", () => {
  it.each([[], ["--unknown"], ["--dry-run", "--live"], ["--model"]])("rejects ambiguous or unsupported modes: %j", (...args) => {
    const result = runExperiment(...args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
    expect(result.stdout).toBe("");
  });

  it("refuses live inference without the model's credentials before emitting requests", () => {
    const result = runExperiment("--live");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Live experiment requires credentials for typesafe:jev-1.14.0. No requests were sent.");
    expect(result.stdout).toBe("");
  });

  it("emits both criteria orders and sends nothing in dry-run mode", () => {
    const result = runExperiment("--dry-run");
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const records = result.stdout.trim().split("\n").map(line => JSON.parse(line));
    expect(records.at(-1)).toMatchObject({ type: "dry_run_complete", requestsSent: 0 });
    expect(records.some(record => record.type === "result" || record.type === "summary")).toBe(false);
    const requests = records.filter(record => record.type === "request");
    expect(requests.map(({ caseId, order }) => ({ caseId, order }))).toEqual(
      cases.flatMap(({ id }) => [
        { caseId: id, order: "normal" },
        { caseId: id, order: "reversed" },
      ]),
    );
    for (const { request } of requests) {
      // The expected kind is evaluation-only, never a model input.
      expect(request).not.toHaveProperty("expected");
      expect(request.state).not.toHaveProperty("expected");
    }
  });
});

describe.each([["cases", cases], ["holdout", holdout]])("material kind %s", (_set, items) => {
  it("label every case with a stored kind and cover each kind at least 4 times", () => {
    for (const item of items) expect(MATERIAL_CATEGORIES).toContain(item.expected);
    for (const kind of MATERIAL_CATEGORIES) {
      expect(items.filter(item => item.expected === kind).length, kind).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("material kind holdout", () => {
  // The first set's names were partly copied into the kind descriptions, which overstated accuracy.
  it("uses no name that appears in the descriptions Jev reads", () => {
    const criteria = JSON.stringify(materialCategoryQuestion()).toLowerCase();
    expect(holdout.filter(item => criteria.includes(item.name.toLowerCase())).map(item => item.name)).toEqual([]);
  });

  it("is chosen with --cases and sends nothing in dry-run mode", () => {
    const result = runExperiment("--dry-run", "--cases", "material-category-holdout.json");
    expect(result.status).toBe(0);
    const requests = result.stdout.trim().split("\n").map(line => JSON.parse(line)).filter(record => record.type === "request");
    expect(requests).toHaveLength(holdout.length * 2);
  });
});
