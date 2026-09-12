// tests/worktree-script.test.ts — scripts/worktree.sh must produce a worktree
// that can actually run: env files symlinked back to the main checkout, deps
// installed in the new worktree.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = resolve(__dirname, "..", "scripts", "worktree.sh");

function initRepo(projectRoot: string) {
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: projectRoot });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: projectRoot });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: projectRoot });
  writeFileSync(join(projectRoot, "file.txt"), "hi");
  spawnSync("git", ["add", "."], { cwd: projectRoot });
  spawnSync("git", ["commit", "-q", "-m", "initial"], { cwd: projectRoot });
}

function fakeBun(projectRoot: string) {
  const binDir = join(projectRoot, ".fakebin");
  const logPath = join(projectRoot, "bun.log");
  mkdirSync(binDir, { recursive: true });
  const bunPath = join(binDir, "bun");
  writeFileSync(bunPath, `#!/usr/bin/env bash\necho "$PWD $*" >> "${logPath}"\n`);
  chmodSync(bunPath, 0o755);
  return { binDir, logPath };
}

function runWorktreeScript(projectRoot: string, binDir: string, branch: string, base?: string) {
  const args = base === undefined ? [scriptPath, branch] : [scriptPath, branch, base];
  return spawnSync("bash", args, {
    cwd: projectRoot,
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    encoding: "utf8",
  });
}

describe("scripts/worktree.sh", () => {
  const createdRoots: string[] = [];

  afterEach(() => {
    for (const dir of createdRoots.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("creates the worktree under .agents/worktrees, symlinks env files, and installs deps", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "worktree-script-"));
    createdRoots.push(projectRoot);
    initRepo(projectRoot);
    writeFileSync(join(projectRoot, ".env.local"), "A=1");
    writeFileSync(join(projectRoot, ".env.test.local"), "B=2");
    const { binDir, logPath } = fakeBun(projectRoot);

    const result = runWorktreeScript(projectRoot, binDir, "feature/x");

    expect(result.status).toBe(0);

    const worktreeDir = join(projectRoot, ".agents", "worktrees", "feature-x");
    expect(existsSync(worktreeDir)).toBe(true);
    expect(realpathSync(join(worktreeDir, ".env.local"))).toBe(realpathSync(join(projectRoot, ".env.local")));
    expect(realpathSync(join(worktreeDir, ".env.test.local"))).toBe(realpathSync(join(projectRoot, ".env.test.local")));
    expect(readFileSync(logPath, "utf8").trim()).toBe(`${realpathSync(worktreeDir)} install --frozen-lockfile`);
    expect(result.stdout).toContain(`ready: ${worktreeDir} (feature/x)`);
  });

  it("skips env files that do not exist in the main checkout instead of failing", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "worktree-script-"));
    createdRoots.push(projectRoot);
    initRepo(projectRoot);
    const { binDir } = fakeBun(projectRoot);

    const result = runWorktreeScript(projectRoot, binDir, "no-env");

    expect(result.status).toBe(0);
    const worktreeDir = join(projectRoot, ".agents", "worktrees", "no-env");
    expect(existsSync(join(worktreeDir, ".env.local"))).toBe(false);
    expect(existsSync(join(worktreeDir, ".env.test.local"))).toBe(false);
  });

  it("branches from an explicit base instead of HEAD", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "worktree-script-"));
    createdRoots.push(projectRoot);
    initRepo(projectRoot);
    spawnSync("git", ["branch", "release"], { cwd: projectRoot });
    writeFileSync(join(projectRoot, "file.txt"), "changed on main");
    spawnSync("git", ["commit", "-qam", "advance main"], { cwd: projectRoot });
    const { binDir } = fakeBun(projectRoot);

    const result = runWorktreeScript(projectRoot, binDir, "from-release", "release");

    expect(result.status).toBe(0);
    const worktreeDir = join(projectRoot, ".agents", "worktrees", "from-release");
    const merged = spawnSync("git", ["merge-base", "--is-ancestor", "from-release", "release"], { cwd: worktreeDir });
    expect(merged.status).toBe(0);
  });
});
