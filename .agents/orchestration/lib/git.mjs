import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runProcess } from "./process.mjs";

const RUNS_EXCLUDE = ":(exclude).agents/orchestration/runs";

export async function workingTreeStatus(root) {
  const result = await runProcess("git", ["status", "--short", "--", ".", RUNS_EXCLUDE], {
    cwd: root,
    timeoutMs: 30_000,
  });
  return result.stdout;
}

export async function assertCleanWorkingTree(root) {
  const status = await workingTreeStatus(root);
  if (status.trim()) {
    throw new Error("Workflow requires a clean working tree; commit, stash, or use a dedicated worktree first");
  }
}

export async function captureDiff(root, directory) {
  const status = await workingTreeStatus(root);
  const tracked = await runProcess("git", ["diff", "--binary", "--", ".", RUNS_EXCLUDE], {
    cwd: root,
    timeoutMs: 30_000,
  });
  const untrackedResult = await runProcess("git", [
    "ls-files", "--others", "--exclude-standard", "-z", "--", ".", RUNS_EXCLUDE,
  ], { cwd: root, timeoutMs: 30_000 });

  const untracked = untrackedResult.stdout.split("\0").filter(Boolean);
  const additions = await Promise.all(untracked.map((file) =>
    runProcess("git", ["diff", "--no-index", "--binary", "--", "/dev/null", file], {
      cwd: root,
      timeoutMs: 30_000,
      allowedExitCodes: [0, 1],
    }),
  ));

  const diff = [tracked.stdout, ...additions.map((result) => result.stdout)].filter(Boolean).join("\n");
  await writeFile(path.join(directory, "git-status.txt"), status, "utf8");
  await writeFile(path.join(directory, "diff.patch"), diff, "utf8");
  return { status, diff };
}
