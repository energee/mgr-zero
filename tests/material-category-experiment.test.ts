// tests/material-category-experiment.test.ts — safety of the material kind experiment CLI and the shape of its synthetic cases.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MATERIAL_CATEGORIES } from "@/lib/mgr/enums";
import cases from "../scripts/material-category-cases.json";

const root = fileURLToPath(new URL("../", import.meta.url));

function runExperiment(...args: string[]) {
  return spawnSync("bun", ["scripts/experiment-material-category.ts", ...args], {
    cwd: root,
    env: { ...process.env, AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "", VERCEL: "" },
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

  it("refuses live inference without Gateway credentials before emitting requests", () => {
    const result = runExperiment("--live");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Live experiment requires AI Gateway credentials. No requests were sent.");
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

describe("material kind cases", () => {
  it("label every case with a stored kind and cover each kind at least 4 times", () => {
    for (const item of cases) expect(MATERIAL_CATEGORIES).toContain(item.expected);
    for (const kind of MATERIAL_CATEGORIES) {
      expect(cases.filter(item => item.expected === kind).length, kind).toBeGreaterThanOrEqual(4);
    }
  });
});
