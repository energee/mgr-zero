// Gates migration ordering, trusted-history immutability, and append-only lock generation.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { outOfOrder } from "@/lib/migration-order";

const MAIN = ["20260928220600_b.sql", "20261016101000_us_ship_to_state_only.sql", "20261001000000_a.sql"];

describe("outOfOrder", () => {
  it("accepts added migrations newer than every migration on main", () => {
    expect(outOfOrder(MAIN, ["20261016101001_next.sql", "20261020000000_later.sql"])).toEqual([]);
  });

  it("flags an added migration older than main's newest", () => {
    expect(outOfOrder(MAIN, ["20261010000000_late.sql", "20261020000000_ok.sql"])).toEqual(["20261010000000_late.sql"]);
  });

  it("flags an added migration with the same timestamp as main's newest", () => {
    expect(outOfOrder(MAIN, ["20261016101000_clash.sql"])).toEqual(["20261016101000_clash.sql"]);
  });

  it("accepts anything when main has no migrations, and nothing added", () => {
    expect(outOfOrder([], ["20200101000000_first.sql"])).toEqual([]);
    expect(outOfOrder(MAIN, [])).toEqual([]);
  });

  it("reads bare file names and supabase/migrations paths alike", () => {
    expect(outOfOrder(["supabase/migrations/20261016101000_x.sql"], ["supabase/migrations/20261001000000_y.sql"]))
      .toEqual(["supabase/migrations/20261001000000_y.sql"]);
  });
});

const roots: string[] = [];
// Hooks export Git's worktree variables; fixtures must never reach the real repo.
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith("GIT_")) delete env[key];
}
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
const migration = "20261016101000_existing.sql";
const nextMigration = "20261016101001_next.sql";
const lockPath = "supabase/migrations.lock.json";
const hash = (sql: string) => createHash("sha256").update(sql).digest("hex");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "migration-integrity-"));
  roots.push(root);
  for (const dir of ["scripts", "lib", "supabase/migrations"]) mkdirSync(join(root, dir), { recursive: true });
  for (const file of ["scripts/check-migration-order.ts", "scripts/lock-migrations.ts", "lib/migration-order.ts"]) {
    cpSync(resolve(file), join(root, file));
  }
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }));
  writeFileSync(join(root, "supabase/migrations", migration), "select 1;\n");
  writeLock(root, { [migration]: hash("select 1;\n") });
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "core.hooksPath", "/dev/null");
  commit(root);
  git(root, "update-ref", "refs/remotes/origin/main", "main");
  git(root, "checkout", "-b", "feature");
  return root;
}

function commit(root: string) {
  git(root, "add", ".");
  git(root, "commit", "-m", "fixture change");
}

function writeLock(root: string, lock: Record<string, string>) {
  writeFileSync(join(root, lockPath), `${JSON.stringify(lock, null, 2)}\n`);
}

function readLock(root: string): Record<string, string> {
  return JSON.parse(readFileSync(join(root, lockPath), "utf8"));
}

function run(root: string, script = "check-migration-order.ts", args = ["main"]) {
  return spawnSync("bun", [`scripts/${script}`, ...args], { cwd: root, env, encoding: "utf8" });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("migration CLI against trusted history", () => {
  it("rejects an edited committed migration even with a matching regenerated lock", () => {
    const root = fixture();
    writeFileSync(join(root, "supabase/migrations", migration), "select 2;\n");
    writeLock(root, { [migration]: hash("select 2;\n") });
    commit(root);
    const result = run(root);
    expect(result.stderr).toContain("immutable");
    expect(result.status).toBe(1);
  });

  it.each(["rename", "delete"])("rejects a committed migration %s", (change) => {
    const root = fixture();
    const file = join(root, "supabase/migrations", migration);
    if (change === "rename") renameSync(file, join(root, "supabase/migrations", nextMigration));
    else rmSync(file);
    writeLock(root, change === "rename" ? { [nextMigration]: hash("select 1;\n") } : {});
    commit(root);
    const result = run(root);
    expect(result.stderr).toContain("immutable");
    expect(result.status).toBe(1);
  });

  it.each(["change", "delete"])("rejects a trusted lock entry %s without SQL changes", (change) => {
    const root = fixture();
    writeLock(root, change === "change" ? { [migration]: hash("select 2;\n") } : {});
    commit(root);
    const result = run(root);
    expect(result.stderr).toContain("lock entry");
    expect(result.status).toBe(1);
  });

  it("pins forward work and resolves a main lock conflict as land-pr does", () => {
    const root = fixture();
    const forward = "20261016101002_feature.sql";
    git(root, "checkout", "main");
    writeFileSync(join(root, "supabase/migrations", nextMigration), "select 2;\n");
    expect(run(root, "lock-migrations.ts", []).status).toBe(0);
    commit(root);
    git(root, "update-ref", "refs/remotes/origin/main", "main");
    git(root, "checkout", "feature");
    writeFileSync(join(root, "supabase/migrations", forward), "select 3;\n");
    expect(run(root, "lock-migrations.ts", []).status).toBe(0);
    expect(readLock(root)).toEqual({ [migration]: hash("select 1;\n"), [forward]: hash("select 3;\n") });
    commit(root);
    const merge = spawnSync("git", ["merge", "--no-edit", "main"], { cwd: root, env, encoding: "utf8" });
    expect(merge.status).toBe(1);
    expect(git(root, "diff", "--name-only", "--diff-filter=U")).toBe(lockPath);
    git(root, "checkout", "--theirs", lockPath);
    expect(run(root, "lock-migrations.ts", []).status).toBe(0);
    expect(readLock(root)).toEqual({
      [migration]: hash("select 1;\n"), [nextMigration]: hash("select 2;\n"), [forward]: hash("select 3;\n"),
    });
    commit(root);
    expect(run(root).status).toBe(0);
    expect(run(root, "lock-migrations.ts", []).status).toBe(0);
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("checks new versions against current main, not only the branch's merge base", () => {
    const root = fixture();
    git(root, "checkout", "main");
    writeFileSync(join(root, "supabase/migrations/20261020000000_main.sql"), "select 3;\n");
    expect(run(root, "lock-migrations.ts", []).status).toBe(0);
    commit(root);
    git(root, "update-ref", "refs/remotes/origin/main", "main");
    git(root, "checkout", "feature");
    // A branch behind main remains valid when it has no new migrations.
    expect(run(root).status).toBe(0);
    writeFileSync(join(root, "supabase/migrations", nextMigration), "select 2;\n");
    expect(run(root, "lock-migrations.ts", []).status).toBe(0);
    commit(root);
    const result = run(root);
    expect(result.stderr).toContain("sorts before");
    expect(result.status).toBe(1);
  });
});

describe("migration lock generation from trusted history", () => {
  it("preserves existing hashes instead of blessing edited SQL", () => {
    const root = fixture();
    writeFileSync(join(root, "supabase/migrations", migration), "select 2;\n");
    writeLock(root, { [migration]: hash("select 2;\n") });
    expect(run(root, "lock-migrations.ts", []).status).toBe(0);
    expect(readLock(root)[migration]).toBe(hash("select 1;\n"));
    commit(root);
    expect(run(root).status).toBe(1);
  });

  it("retains pins for deleted files so local hash checks still detect deletion", () => {
    const root = fixture();
    rmSync(join(root, "supabase/migrations", migration));
    expect(run(root, "lock-migrations.ts", []).status).toBe(0);
    expect(readLock(root)).toEqual({ [migration]: hash("select 1;\n") });
  });

  it.each(["edit", "rename"])("regenerates a committed branch-only migration after %s", (change) => {
    const root = fixture();
    const file = join(root, "supabase/migrations", nextMigration);
    writeFileSync(file, "select 2;\n");
    expect(run(root, "lock-migrations.ts", []).status).toBe(0);
    commit(root);
    const revised = change === "rename" ? "20261016101002_revised.sql" : nextMigration;
    if (change === "rename") renameSync(file, join(root, "supabase/migrations", revised));
    writeFileSync(join(root, "supabase/migrations", revised), "select 3;\n");
    expect(run(root, "lock-migrations.ts", []).status).toBe(0);
    expect(readLock(root)).toEqual({ [migration]: hash("select 1;\n"), [revised]: hash("select 3;\n") });
    commit(root);
    expect(run(root).status).toBe(0);
  });

  it("drops a removed branch-only pin without dropping trusted main pins", () => {
    const root = fixture();
    const file = join(root, "supabase/migrations", nextMigration);
    writeFileSync(file, "select 2;\n");
    expect(run(root, "lock-migrations.ts", []).status).toBe(0);
    commit(root);
    rmSync(file);
    expect(run(root, "lock-migrations.ts", []).status).toBe(0);
    expect(readLock(root)).toEqual({ [migration]: hash("select 1;\n") });
    commit(root);
    expect(run(root).status).toBe(0);
  });

  it("fails without trusted main history and leaves the checkout lock untouched", () => {
    const root = fixture();
    git(root, "update-ref", "-d", "refs/remotes/origin/main");
    const before = readFileSync(join(root, lockPath), "utf8");
    const result = run(root, "lock-migrations.ts", []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Cannot load trusted migration history");
    expect(readFileSync(join(root, lockPath), "utf8")).toBe(before);
  });
});
