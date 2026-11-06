// tests/agent-evals-cli.test.ts — runs scripts/agent-evals.ts as a real process.
// It proves the CLI sends nothing, and that the model never sees an expected answer.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evalCaseSchema } from "@/lib/mgr/agent-eval-score";
import fixture from "./fixtures/agent-evals.json";

const root = fileURLToPath(new URL("../", import.meta.url));
const cases = evalCaseSchema.array().parse(fixture);

// A bare environment and no env file, so no key can reach the script.
function runEvals(args: string[], env: Record<string, string> = {}) {
  return spawnSync("bun", ["--no-env-file", "scripts/agent-evals.ts", ...args], {
    cwd: root,
    env: { NODE_ENV: "test", PATH: process.env.PATH, ...env },
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe("agent evals CLI safety", () => {
  it.each([[[]], [["--unknown"]], [["--dry-run", "--live"]]])("rejects ambiguous or unsupported modes: %j", args => {
    const result = runEvals(args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
    expect(result.stdout).toBe("");
  });

  it("refuses --live without credentials and sends nothing", () => {
    const result = runEvals(["--live"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No requests were sent.");
    expect(result.stdout).toBe("");
  });

  it("refuses --live even with a key, because no runner exists yet", () => {
    const result = runEvals(["--live"], { ANTHROPIC_API_KEY: "not-a-real-key" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No requests were sent.");
    expect(result.stdout).toBe("");
  });
});

describe("agent evals dry run", () => {
  const dryRun = () => {
    const result = runEvals(["--dry-run"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    return result.stdout.trim().split("\n").map(line => JSON.parse(line));
  };

  it("validates every case and says it sent nothing", () => {
    const records = dryRun();
    expect(records[0]).toMatchObject({ type: "run", mode: "dry_run", cases: cases.length, requests: cases.length * 2, placeholderCases: cases.length });
    expect(records.at(-1)).toEqual({ type: "dry_run_complete", validatedCases: cases.length, requestsSent: 0, modelResults: null });
    expect(records.some(record => record.type === "result" || record.type === "summary")).toBe(false);
  });

  it("emits each case in normal and reversed order", () => {
    const requests = dryRun().filter(record => record.type === "request");
    expect(requests.map(({ caseId, order }) => ({ caseId, order }))).toEqual(
      cases.flatMap(({ id }) => [{ caseId: id, order: "normal" }, { caseId: id, order: "reversed" }]),
    );
  });

  it("reverses the judge's labels, and nothing the agent reads", () => {
    const requests = dryRun().filter(record => record.type === "request");
    for (let index = 0; index < requests.length; index += 2) {
      const [normal, reversed] = [requests[index], requests[index + 1]];
      expect(reversed.request).toEqual(normal.request);
      if (normal.judgeLabels) expect(Object.keys(reversed.judgeLabels)).toEqual(Object.keys(normal.judgeLabels).reverse());
    }
    expect(requests.some(record => record.judgeLabels)).toBe(true);
  });

  it("keeps every expected answer out of what the agent reads", () => {
    const requests = dryRun().filter(record => record.type === "request");
    for (const { caseId, request } of requests) {
      const item = cases.find(({ id }) => id === caseId)!;
      const sent = JSON.stringify(request);
      expect(Object.keys(request).sort()).toEqual(["prompt", "role"]);
      const facts = "facts" in item.expectation ? item.expectation.facts : [];
      for (const fact of facts) if ("contains" in fact) expect(sent).not.toContain(fact.contains);
      for (const value of item.pastRole ?? []) expect(sent).not.toContain(value);
    }
  });
});

describe("the starter cases", () => {
  it("cover all three kinds and are marked as placeholders", () => {
    expect(new Set(cases.map(item => item.kind))).toEqual(new Set(["read", "write", "safety"]));
    expect(cases.every(item => item.source === "author")).toBe(true);
  });
});
