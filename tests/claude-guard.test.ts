// tests/claude-guard.test.ts — scripts/claude-guard.sh is the Claude Code
// PreToolUse hook that blocks a commit/push chained to a test run, and a
// commit/push while supabase/migrations.lock.json is not valid JSON.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = resolve(__dirname, "..", "scripts", "claude-guard.sh");

// A suite run from pre-push inherits GIT_DIR and friends; strip them so the
// script's git calls cannot reach the real repository.
const noGitEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))) as NodeJS.ProcessEnv;

function makeTree(lock: string) {
  const dir = mkdtempSync(join(tmpdir(), "claude-guard-"));
  mkdirSync(join(dir, "supabase"));
  writeFileSync(join(dir, "supabase", "migrations.lock.json"), lock);
  return dir;
}

function runGuard(command: string, cwd: string) {
  const payload = JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd });
  return spawnSync("bash", [scriptPath], { cwd, env: noGitEnv, input: payload, encoding: "utf8" });
}

describe("scripts/claude-guard.sh", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const tree = (lock = "{}") => {
    const dir = makeTree(lock);
    dirs.push(dir);
    return dir;
  };

  it("allows a plain commit", () => {
    const result = runGuard("git commit -m x", tree());
    expect(result.status).toBe(0);
  });

  it("allows a test run that does not commit or push", () => {
    const result = runGuard("bunx vitest run tests/foo.test.ts", tree("not json"));
    expect(result.status).toBe(0);
  });

  it("blocks a commit chained to a test run", () => {
    const result = runGuard("bunx vitest run && git commit -m x", tree());
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("separate");
  });

  it("blocks a push chained to tsc", () => {
    const result = runGuard("bunx tsc --noEmit; git push -u origin x", tree());
    expect(result.status).toBe(2);
  });

  it("blocks a commit when the migrations lock is not valid JSON", () => {
    const result = runGuard("git commit -m x", tree('{"a": 1,'));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("migrations.lock.json");
  });
});
