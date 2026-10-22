// tests/file-doc-findings.test.ts — the doc agents' findings reach GitHub only
// through scripts/file-doc-findings.sh: one upserted issue per agent with a fixed
// title, so model text never reaches an issue title (dreaming's watchdog collector
// reads titles) and reruns update one issue instead of filing more. `gh` is stubbed.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve("scripts/file-doc-findings.sh");

function run(findings: string, openIssue = "") {
  const root = mkdtempSync(join(tmpdir(), "doc-findings-"));
  try {
    writeFileSync(join(root, "findings.jsonl"), findings);
    // `gh issue list` prints the open issue's number (or nothing), as its --jq would.
    // Each other `gh` call is logged NUL-terminated, since bodies span lines.
    writeFileSync(
      join(root, "gh"),
      `#!/bin/bash
if [ "$2" = "list" ]; then printf '%s' "${openIssue}"; exit; fi
printf '%s\\0' "$*" >> "${root}/calls"
`,
      { mode: 0o755 },
    );
    const result = spawnSync("bash", [script, join(root, "findings.jsonl"), "test agent"], {
      env: { ...process.env, PATH: `${root}:${process.env.PATH}` },
      encoding: "utf8",
    });
    let calls: string[] = [];
    try {
      calls = readFileSync(join(root, "calls"), "utf8").split("\0").filter(Boolean);
    } catch {
      // No issue was created or edited.
    }
    return { result, calls };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const finding = (title: string, body = `Why ${title} matters.`) => JSON.stringify({ title, body });

describe("file-doc-findings.sh", () => {
  it.each([[""], ["\n\n"]])("does nothing when there are no findings: %j", (findings) => {
    const { result, calls } = run(findings);
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toEqual([]);
  });

  it("creates one issue with a fixed title listing every finding", () => {
    const { result, calls } = run(`${finding("Slack guide not linked")}\n${finding("Retention runbook failing")}\n`);
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("issue create --title Docs gaps: test agent --label documentation --body");
    expect(calls[0]).toContain("### Slack guide not linked");
    expect(calls[0]).toContain("### Retention runbook failing");
  });

  it("replaces the open issue's list instead of filing another", () => {
    const { result, calls } = run(`${finding("Slack guide not linked")}\n`, "42");
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^issue edit 42 --body /);
  });

  it("lists at most twenty findings", () => {
    const lines = Array.from({ length: 25 }, (_, i) => finding(`gap ${i}`)).join("\n");
    const { calls } = run(lines);
    expect(calls[0]).toContain("### gap 19");
    expect(calls[0]).not.toContain("### gap 20");
  });

  it("defuses @-mentions copied from untrusted content", () => {
    const { calls } = run(finding("Ping", "cc @someone and @org/team"));
    expect(calls[0]).not.toMatch(/@someone|@org/);
  });

  it.each([["not json"], [JSON.stringify({ title: "", body: "x" })], [JSON.stringify({ title: "x" })]])(
    "fails loudly on a malformed finding: %s",
    (line) => {
      const { result, calls } = run(`${line}\n`);
      expect(result.status).not.toBe(0);
      expect(calls).toEqual([]);
    },
  );
});
