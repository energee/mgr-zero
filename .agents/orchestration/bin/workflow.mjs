#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fixRun,
  implementRun,
  listRuns,
  loadPolicy,
  planRun,
  reviewRun,
} from "../lib/workflow.mjs";
import { loadState } from "../lib/state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function usage() {
  console.log(`MGR multi-agent workflow

Usage:
  workflow plan [--tier TIER] <task>
  workflow run [--tier TIER] <task>
  workflow implement --approve <run-id>
  workflow review <run-id>
  workflow fix --approve <run-id>
  workflow status [run-id]
  workflow doctor

Tiers: mechanical, standard, complex, high-risk

Complex and high-risk runs stop after planning. Inspect the run artifacts, then
continue with "workflow implement --approve <run-id>". No command commits changes.`);
}

function parse(argv) {
  const values = { positionals: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--approve") values.approved = true;
    else if (value === "--tier") {
      values.tier = argv[index + 1];
      index += 1;
    } else if (value === "--help" || value === "-h") values.help = true;
    else if (value.startsWith("--")) throw new Error(`Unknown option: ${value}`);
    else values.positionals.push(value);
  }
  return values;
}

function printRun(result, next) {
  console.log(JSON.stringify({
    runId: result.state.id,
    tier: result.state.tier,
    status: result.state.status,
    agentRuns: result.state.agentRuns,
    artifacts: path.relative(root, result.directory),
    next,
  }, null, 2));
}

function doctor() {
  const commands = {
    grok: process.env.AGENT_WORKFLOW_GROK_BIN || "grok",
    codex: process.env.AGENT_WORKFLOW_CODEX_BIN || "codex",
    claude: process.env.AGENT_WORKFLOW_CLAUDE_BIN || "claude",
    pi: process.env.AGENT_WORKFLOW_PI_BIN || "pi",
  };
  let missing = false;
  for (const [name, command] of Object.entries(commands)) {
    const result = spawnSync("sh", ["-c", "command -v -- \"$1\"", "sh", command], { encoding: "utf8" });
    const found = result.status === 0;
    missing ||= !found;
    console.log(`${found ? "ok" : "missing"}\t${name}\t${found ? result.stdout.trim() : command}`);
  }
  if (missing) process.exitCode = 1;
}

async function main() {
  if (process.env.MULTI_AGENT_ACTIVE === "1") {
    throw new Error("Recursive multi-agent invocation refused");
  }
  const [command, ...rest] = process.argv.slice(2);
  const args = parse(rest);
  if (!command || command === "--help" || command === "-h" || args.help) return usage();

  const policy = await loadPolicy(root);
  if (command === "doctor") return doctor();

  if (command === "status") {
    const runId = args.positionals[0];
    const result = runId ? [(await loadState(root, runId)).state] : await listRuns(root);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "plan" || command === "run") {
    const task = args.positionals.join(" ").trim();
    if (!task) throw new Error(`${command} requires a task`);
    const tier = args.tier || policy.defaultTier;
    const planned = await planRun(root, { task, tier });
    if (command === "plan" || policy.tiers[tier].requiresPlanApproval) {
      const next = policy.tiers[tier].requiresPlanApproval
        ? `.agents/orchestration/bin/workflow implement --approve ${planned.state.id}`
        : `.agents/orchestration/bin/workflow implement ${planned.state.id}`;
      return printRun(planned, next);
    }
    const implemented = await implementRun(root, planned.state.id);
    return printRun(implemented, null);
  }

  const runId = args.positionals[0];
  if (!runId) throw new Error(`${command} requires a run ID`);
  if (command === "implement") {
    const result = await implementRun(root, runId, { approved: args.approved });
    const reviewer = policy.tiers[result.state.tier].reviewer;
    return printRun(result, reviewer ? `.agents/orchestration/bin/workflow review ${runId}` : null);
  }
  if (command === "review") {
    const result = await reviewRun(root, runId);
    return printRun(result, `.agents/orchestration/bin/workflow fix --approve ${runId}`);
  }
  if (command === "fix") {
    const result = await fixRun(root, runId, { approved: args.approved });
    return printRun(result, null);
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`workflow: ${error.message}`);
  process.exitCode = 1;
});
