#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bin as claudeBin } from "../adapters/claude.mjs";
import { bin as codexBin } from "../adapters/codex.mjs";
import { bin as grokBin } from "../adapters/grok.mjs";
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

Tiers: standard, complex, high-risk

Complex and high-risk runs stop after planning. Inspect the run artifacts, then
continue with "workflow implement --approve <run-id>". No command commits changes.`);
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
  const commands = { grok: grokBin(), codex: codexBin(), claude: claudeBin() };
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
  const { values: args, positionals } = parseArgs({
    args: rest,
    options: {
      tier: { type: "string" },
      approve: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (!command || command === "--help" || command === "-h" || args.help) return usage();
  if (command === "doctor") return doctor();

  const policy = await loadPolicy(root);
  if (command === "status") {
    const runId = positionals[0];
    const result = runId ? [(await loadState(root, runId)).state] : await listRuns(root);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "plan" || command === "run") {
    const task = positionals.join(" ").trim();
    if (!task) throw new Error(`${command} requires a task`);
    const tier = args.tier || policy.defaultTier;
    const planned = await planRun(root, { task, tier, policy });
    const gate = policy.tiers[tier]?.requiresPlanApproval;
    if (command === "plan" || gate) {
      return printRun(planned, `.agents/orchestration/bin/workflow implement ${gate ? "--approve " : ""}${planned.state.id}`);
    }
    const implemented = await implementRun(root, planned.state.id, { policy });
    return printRun(implemented, null);
  }

  const runId = positionals[0];
  if (!runId) throw new Error(`${command} requires a run ID`);
  if (command === "implement") {
    const result = await implementRun(root, runId, { approved: args.approve, policy });
    const reviewer = policy.tiers[result.state.tier].reviewer;
    return printRun(result, reviewer ? `.agents/orchestration/bin/workflow review ${runId}` : null);
  }
  if (command === "review") {
    const result = await reviewRun(root, runId, { policy });
    return printRun(result, `.agents/orchestration/bin/workflow fix --approve ${runId}`);
  }
  if (command === "fix") {
    const result = await fixRun(root, runId, { approved: args.approve, policy });
    return printRun(result, null);
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`workflow: ${error.message}`);
  process.exitCode = 1;
});
