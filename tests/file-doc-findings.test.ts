// tests/file-doc-findings.test.ts — the doc agents' findings become issues only
// through scripts/file-doc-findings.sh: model output, so it is validated,
// deduplicated against open issues, and capped. `gh` is stubbed on PATH.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve("scripts/file-doc-findings.sh");

function run(findings: string, openTitles: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "doc-findings-"));
  try {
    writeFileSync(join(root, "findings.jsonl"), findings);
    writeFileSync(join(root, "open.json"), JSON.stringify(openTitles.map((title) => ({ title }))));
    // Each `gh issue create` is logged NUL-terminated, since bodies span lines.
    // `gh issue list` prints the open titles (the script filters them with --jq, so
    // the stub returns raw JSON and lets jq run for real).
    writeFileSync(
      join(root, "gh"),
      `#!/bin/bash
if [ "$2" = "list" ]; then
  for ((i = 1; i <= $#; i++)); do [ "\${!i}" = "--jq" ] && { j=$((i + 1)); jq -r "\${!j}" "${root}/open.json"; exit; }; done
fi
printf '%s\\0' "$*" >> "${root}/created"
`,
      { mode: 0o755 },
    );
    const result = spawnSync("bash", [script, join(root, "findings.jsonl"), "test agent"], {
      env: { ...process.env, PATH: `${root}:${process.env.PATH}` },
      encoding: "utf8",
    });
    let created: string[] = [];
    try {
      created = readFileSync(join(root, "created"), "utf8").split("\0").filter(Boolean);
    } catch {
      // No issue was created.
    }
    return { result, created };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const finding = (title: string) => JSON.stringify({ title, body: `Why ${title} matters.` });

describe("file-doc-findings.sh", () => {
  it("does nothing for an empty or missing findings file", () => {
    const { result, created } = run("");
    expect(result.status, result.stderr).toBe(0);
    expect(created).toEqual([]);
  });

  it("files each finding once with a prefixed title and the documentation label", () => {
    const { result, created } = run(`${finding("Slack guide not linked")}\n${finding("Retention runbook orphaned")}\n`);
    expect(result.status, result.stderr).toBe(0);
    expect(created).toHaveLength(2);
    expect(created[0]).toContain("issue create --title Docs gap: Slack guide not linked");
    expect(created[0]).toContain("--label documentation");
    expect(created[0]).toContain("Filed by the test agent");
  });

  it("skips a finding whose title is already an open issue", () => {
    const { result, created } = run(`${finding("Slack guide not linked")}\n`, ["Docs gap: Slack guide not linked"]);
    expect(result.status, result.stderr).toBe(0);
    expect(created).toEqual([]);
  });

  it("files at most five issues per run", () => {
    const lines = Array.from({ length: 8 }, (_, i) => finding(`gap ${i}`)).join("\n");
    const { result, created } = run(lines);
    expect(result.status, result.stderr).toBe(0);
    expect(created).toHaveLength(5);
  });

  it.each([["not json"], [JSON.stringify({ title: "", body: "x" })], [JSON.stringify({ title: "x" })]])(
    "fails loudly on a malformed finding: %s",
    (line) => {
      const { result, created } = run(`${line}\n`);
      expect(result.status).not.toBe(0);
      expect(created).toEqual([]);
    },
  );
});
