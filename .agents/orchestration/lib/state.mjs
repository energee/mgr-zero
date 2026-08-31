import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function createRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

export function runDirectory(root, runId) {
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error("Invalid run ID");
  return path.join(root, ".agents", "orchestration", "runs", runId);
}

export async function createState(root, { task, tier }) {
  const id = createRunId();
  const directory = runDirectory(root, id);
  await mkdir(directory, { recursive: true });
  const state = {
    version: 1,
    id,
    task,
    tier,
    status: "created",
    agentRuns: 0,
    reviewRounds: 0,
    fixRounds: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveState(directory, state);
  await writeFile(path.join(directory, "request.md"), `# Task\n\n${task}\n`, "utf8");
  return { directory, state };
}

export async function loadState(root, runId) {
  const directory = runDirectory(root, runId);
  const state = JSON.parse(await readFile(path.join(directory, "state.json"), "utf8"));
  return { directory, state };
}

export async function saveState(directory, state) {
  state.updatedAt = new Date().toISOString();
  await writeFile(path.join(directory, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
