import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import cases from "../scripts/production-attention-cases.json";

const root = fileURLToPath(new URL("../", import.meta.url));

function runExperiment(...args: string[]) {
  return spawnSync("bun", ["scripts/experiment-production-attention.ts", ...args], {
    cwd: root,
    env: { ...process.env, TYPESAFE_API_KEY: "" },
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("production attention experiment CLI safety", () => {
  it.each([[], ["--unknown"], ["--dry-run", "--live"]])("rejects ambiguous or unsupported modes: %j", (...args) => {
    const result = runExperiment(...args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
    expect(result.stdout).toBe("");
  });

  it("refuses live inference without credentials before emitting requests", () => {
    const result = runExperiment("--live");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Live experiment requires TYPESAFE_API_KEY. No requests were sent.");
    expect(result.stdout).toBe("");
  });

  it("emits both criterion orders without evaluation labels or model predictions in dry-run mode", () => {
    const result = runExperiment("--dry-run");
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const records = result.stdout.trim().split("\n").map(line => JSON.parse(line));
    expect(records.at(-1)).toMatchObject({
      type: "dry_run_complete", requestsSent: 0, modelResults: null,
    });
    expect(records.some(record => record.type === "result" || record.type === "summary")).toBe(false);
    const requests = records.filter(record => record.type === "request");
    expect(requests.map(({ caseId, order }) => ({ caseId, order }))).toEqual(
      cases.flatMap(({ id }) => [
        { caseId: id, order: "normal" },
        { caseId: id, order: "reversed" },
      ]),
    );
    for (const { request } of requests) {
      // The reference status and evidence are evaluation-only, never model inputs.
      expect(request).not.toHaveProperty("expected");
      expect(request).not.toHaveProperty("evidence");
      expect(request.state).not.toHaveProperty("expected");
      expect(request.state).not.toHaveProperty("evidence");
    }
  });
});
