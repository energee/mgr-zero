import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { implementRun, planRun, reviewRun } from "../lib/workflow.mjs";

const orchestrationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mockAgent = path.join(orchestrationRoot, "tests/mock-agent.mjs");

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mgr-workflow-"));
  t.after(async () => { await import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })); });
  await mkdir(path.join(root, ".agents"), { recursive: true });
  await cp(orchestrationRoot, path.join(root, ".agents/orchestration"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  process.env.AGENT_WORKFLOW_GROK_BIN = mockAgent;
  process.env.AGENT_WORKFLOW_CODEX_BIN = mockAgent;
  process.env.AGENT_WORKFLOW_CLAUDE_BIN = mockAgent;
  return root;
}

test("standard run plans locally and uses one Codex run", async (t) => {
  const root = await fixture(t);
  const planned = await planRun(root, { task: "Small fix", tier: "standard" });
  assert.equal(planned.state.agentRuns, 0);
  assert.equal(planned.state.status, "planned");

  await writeFile(path.join(root, "new-file.txt"), "created by implementer\n", "utf8");
  const implemented = await implementRun(root, planned.state.id);
  assert.equal(implemented.state.agentRuns, 1);
  assert.equal(implemented.state.status, "implemented");
  assert.match(await readFile(path.join(implemented.directory, "implementation.json"), "utf8"), /Mock implementation/);
  assert.match(await readFile(path.join(implemented.directory, "diff.patch"), "utf8"), /new-file\.txt/);
});

test("new runs refuse a dirty working tree", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "dirty.txt"), "unrelated\n", "utf8");
  await assert.rejects(() => planRun(root, { task: "Small fix", tier: "standard" }), /clean working tree/);
});

test("complex run requires approval and stays within its route budget", async (t) => {
  const root = await fixture(t);
  const planned = await planRun(root, { task: "Cross-layer feature", tier: "complex" });
  assert.equal(planned.state.agentRuns, 1);
  await assert.rejects(() => implementRun(root, planned.state.id), /requires explicit plan approval/);

  const implemented = await implementRun(root, planned.state.id, { approved: true });
  const reviewed = await reviewRun(root, planned.state.id);
  assert.equal(implemented.state.status, "implemented");
  assert.equal(reviewed.state.agentRuns, 3);
  assert.equal(reviewed.state.status, "reviewed");
});

test("high-risk planning uses Grok and Claude before the approval gate", async (t) => {
  const root = await fixture(t);
  const planned = await planRun(root, { task: "Change RLS", tier: "high-risk" });
  assert.equal(planned.state.agentRuns, 2);
  assert.equal(planned.state.status, "planned");
  assert.match(await readFile(path.join(planned.directory, "plan-review.json"), "utf8"), /approve/);
});
