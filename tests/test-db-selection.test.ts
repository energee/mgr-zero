// Gates actual Vitest selection: pure specs need no database; mixed/unknown specs do.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { expectedMigration } from "../scripts/test-db-schema.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

it("runs pure selections with an unavailable DB but guards every mixed DB/unknown selection", () => {
  const temp = mkdtempSync(join(tmpdir(), "mgr-test-selection-"));
  try {
    mkdirSync(join(temp, "tests"));
    for (const directory of ["supabase", "scripts", "node_modules"]) {
      symlinkSync(join(root, directory), join(temp, directory), "dir");
    }
    symlinkSync(join(root, "tests/supabase"), join(temp, "tests/supabase"), "dir");
    for (const file of ["test-db-schema-guard.test.ts", "schema-rules.test.ts", "test-db-lock.setup.ts"]) {
      symlinkSync(join(root, "tests", file), join(temp, "tests", file));
    }
    const executed = join(temp, "unclassified-executed");
    writeFileSync(join(temp, "tests/unclassified.test.ts"), `import { it } from "vitest"; import { writeFileSync } from "node:fs"; it("must be guarded", () => { writeFileSync(${JSON.stringify(executed)}, "executed"); });`);
    // A nonexistent database is genuinely unavailable without stopping or changing
    // the shared stack. Even trust authentication cannot open this database.
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54351",
      DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:54352/missing_${crypto.randomUUID().replaceAll("-", "")}`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
      SUPABASE_SECRET_KEY: "fixture-secret",
      MGR_TEST_STACK: "1",
    };
    writeFileSync(join(temp, ".env.test.local"), Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n"));
    const config = join(temp, "vitest.config.mts");
    writeFileSync(config, `import base from ${JSON.stringify(join(root, "vitest.config.mts"))};
export default { ...base, root: ${JSON.stringify(temp)}, test: { ...base.test, env: { ...base.test.env, ...${JSON.stringify(env)} } } };`);
    const childEnv: NodeJS.ProcessEnv = { ...process.env, MGR_TEST_DB_LOCK: join(temp, "lock") };
    delete childEnv.MGR_TEST_DB_LOCK_FD;
    const launch = (args: string[]) => spawnSync(join(root, "node_modules/.bin/vitest"), [...args, "--config", config], {
      cwd: temp, env: childEnv, encoding: "utf8", timeout: 30000,
    });
    const listing = launch(["list", "--filesOnly", "--json"]);
    expect(listing.error).toBeUndefined();
    expect(listing.status, listing.stdout + listing.stderr).toBe(0);
    const specs = JSON.parse(listing.stdout) as { file: string; projectName: string }[];
    expect(specs.map(spec => `${spec.projectName}:${basename(spec.file)}`).sort()).toEqual([
      "database:schema-rules.test.ts",
      "database:unclassified.test.ts",
      "pure:test-db-schema-guard.test.ts",
    ]);
    const pure = launch(["run", "tests/test-db-schema-guard.test.ts"]);
    expect(pure.error).toBeUndefined();
    expect(pure.status, pure.stdout + pure.stderr).toBe(0);
    const version = expectedMigration(readdirSync(join(root, "supabase/migrations")));
    for (const file of ["tests/schema-rules.test.ts", "tests/unclassified.test.ts"]) {
      const mixed = launch(["run", "tests/test-db-schema-guard.test.ts", file]);
      const output = mixed.stdout + mixed.stderr;
      expect(mixed.error).toBeUndefined();
      expect(mixed.status, output).not.toBe(0);
      expect(output).toContain("test db history unavailable: expected");
      expect(output).toContain(version);
      expect(existsSync(executed)).toBe(false);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}, 150000);
