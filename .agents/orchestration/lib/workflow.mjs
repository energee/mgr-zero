import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runClaude } from "../adapters/claude.mjs";
import { runCodex } from "../adapters/codex.mjs";
import { runGrok } from "../adapters/grok.mjs";
import { assertCleanWorkingTree, captureDiff } from "./git.mjs";
import { createState, loadState, saveState } from "./state.mjs";

export async function loadPolicy(root) {
  return JSON.parse(await readFile(path.join(root, ".agents/orchestration/policy.json"), "utf8"));
}

async function promptFile(root, name) {
  return readFile(path.join(root, `.agents/orchestration/prompts/${name}.md`), "utf8");
}

function schema(root, name) {
  return path.join(root, `.agents/orchestration/schemas/${name}.schema.json`);
}

// Missing artifacts (e.g. no plan for plannerless tiers) read as empty sections.
function optionalFile(directory, name) {
  return readFile(path.join(directory, name), "utf8").catch(() => "");
}

async function invoke(root, directory, state, policy, { agent, role, prompt, schemaName }) {
  const tierPolicy = policy.tiers[state.tier];
  if (state.agentRuns >= tierPolicy.maxAgentRuns) {
    throw new Error(`Run budget exhausted (${state.agentRuns}/${tierPolicy.maxAgentRuns})`);
  }

  state.agentRuns += 1;
  await saveState(directory, state);
  const timeoutMs = policy.limits.timeoutMinutes * 60_000;
  const options = { cwd: root, prompt, schemaPath: schema(root, schemaName), timeoutMs };
  const adapters = { grok: runGrok, codex: runCodex, claude: runClaude };
  const adapter = adapters[agent];
  if (!adapter) throw new Error(`No adapter for ${agent}`);

  const prefix = `${String(state.agentRuns).padStart(2, "0")}-${agent}-${role}`;
  try {
    const result = await adapter(options);
    await writeFile(path.join(directory, `${prefix}.out`), result.stdout, "utf8");
    await writeFile(path.join(directory, `${prefix}.err`), result.stderr, "utf8");
    return result.stdout;
  } catch (error) {
    if (error.result) {
      await writeFile(path.join(directory, `${prefix}.out`), error.result.stdout, "utf8");
      await writeFile(path.join(directory, `${prefix}.err`), error.result.stderr, "utf8");
    }
    state.lastError = error.message;
    state.status = "failed";
    await saveState(directory, state);
    throw error;
  }
}

export async function planRun(root, { task, tier, policy }) {
  policy ??= await loadPolicy(root);
  const tierPolicy = policy.tiers[tier];
  if (!tierPolicy) throw new Error(`Unknown tier: ${tier}`);
  await assertCleanWorkingTree(root);
  const { directory, state } = await createState(root, { task, tier });

  if (tierPolicy.planner) {
    const base = await promptFile(root, "planner");
    const output = await invoke(root, directory, state, policy, {
      agent: tierPolicy.planner,
      role: "plan",
      schemaName: "plan",
      prompt: `${base}\n\nTask tier: ${tier}\nTask:\n${task}`,
    });
    await writeFile(path.join(directory, "plan.json"), output, "utf8");

    if (tierPolicy.planReviewer) {
      const reviewer = await promptFile(root, "reviewer");
      const review = await invoke(root, directory, state, policy, {
        agent: tierPolicy.planReviewer,
        role: "plan-review",
        schemaName: "review",
        prompt: `${reviewer}\n\nReview this proposed plan before implementation. Use file="plan" for plan-level findings.\n\nTask:\n${task}\n\nPlan:\n${output}`,
      });
      await writeFile(path.join(directory, "plan-review.json"), review, "utf8");
    }
  }

  state.status = "planned";
  delete state.lastError;
  await saveState(directory, state);
  return { directory, state };
}

export async function implementRun(root, runId, { approved = false, policy } = {}) {
  policy ??= await loadPolicy(root);
  const { directory, state } = await loadState(root, runId);
  const tierPolicy = policy.tiers[state.tier];
  if (tierPolicy.requiresPlanApproval && !approved) {
    throw new Error(`Tier ${state.tier} requires explicit plan approval (--approve)`);
  }
  if (state.status !== "planned") throw new Error(`Cannot implement a run in status ${state.status}`);

  const [base, plan, planReview] = await Promise.all([
    promptFile(root, "implementer"),
    optionalFile(directory, "plan.json"),
    optionalFile(directory, "plan-review.json"),
  ]);
  const sections = [base, `Task:\n${state.task}`];
  if (plan) sections.push(`Approved plan:\n${plan}`);
  if (planReview) sections.push(`Plan review:\n${planReview}`);
  const output = await invoke(root, directory, state, policy, {
    agent: tierPolicy.implementer,
    role: "implement",
    schemaName: "implementation",
    prompt: sections.join("\n\n"),
  });
  await writeFile(path.join(directory, "implementation.json"), output, "utf8");
  await captureDiff(root, directory);
  state.status = "implemented";
  delete state.lastError;
  await saveState(directory, state);
  return { directory, state };
}

export async function reviewRun(root, runId, { policy } = {}) {
  policy ??= await loadPolicy(root);
  const { directory, state } = await loadState(root, runId);
  const tierPolicy = policy.tiers[state.tier];
  if (!tierPolicy.reviewer) throw new Error(`Tier ${state.tier} has no automatic external reviewer`);
  if (!["implemented", "fixed"].includes(state.status)) throw new Error(`Cannot review a run in status ${state.status}`);

  const [base, plan, implementation] = await Promise.all([
    promptFile(root, "reviewer"),
    optionalFile(directory, "plan.json"),
    readFile(path.join(directory, "implementation.json"), "utf8"),
  ]);
  const { diff, status } = await captureDiff(root, directory);
  const output = await invoke(root, directory, state, policy, {
    agent: tierPolicy.reviewer,
    role: "review",
    schemaName: "review",
    prompt: `${base}\n\nTask:\n${state.task}\n\nPlan:\n${plan}\n\nImplementation report:\n${implementation}\n\nGit status:\n${status}\n\nDiff:\n${diff}`,
  });
  await writeFile(path.join(directory, "review.json"), output, "utf8");
  state.status = "reviewed";
  await saveState(directory, state);
  return { directory, state };
}

export async function fixRun(root, runId, { approved = false, policy } = {}) {
  if (!approved) throw new Error("Applying review findings requires explicit approval (--approve)");
  policy ??= await loadPolicy(root);
  const { directory, state } = await loadState(root, runId);
  const tierPolicy = policy.tiers[state.tier];
  if (state.status !== "reviewed") throw new Error(`Cannot fix a run in status ${state.status}`);

  const [base, plan, review] = await Promise.all([
    promptFile(root, "implementer"),
    optionalFile(directory, "plan.json"),
    readFile(path.join(directory, "review.json"), "utf8"),
  ]);
  const output = await invoke(root, directory, state, policy, {
    agent: tierPolicy.implementer,
    role: "fix",
    schemaName: "implementation",
    prompt: `${base}\n\nTask:\n${state.task}\n\nApproved plan:\n${plan}\n\nApproved review findings to address:\n${review}\n\nApply only actionable findings and rerun verification.`,
  });
  await writeFile(path.join(directory, "implementation.json"), output, "utf8");
  await captureDiff(root, directory);
  state.status = "fixed";
  await saveState(directory, state);
  return { directory, state };
}

export async function listRuns(root) {
  const runsRoot = path.join(root, ".agents/orchestration/runs");
  const entries = await readdir(runsRoot, { withFileTypes: true });
  const states = await Promise.all(
    entries
      .filter((item) => item.isDirectory())
      .sort((a, b) => b.name.localeCompare(a.name))
      .map((entry) => loadState(root, entry.name).then((run) => run.state, () => null)),
  );
  return states.filter(Boolean);
}
