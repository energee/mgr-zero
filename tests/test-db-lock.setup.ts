// tests/test-db-lock.setup.ts — vitest globalSetup: hold scripts/test-db-lock.pl
// shared for the whole run, so scripts/test-db.sh never resets the shared test
// database under it and this run waits out a reset already in progress. The
// perl holder exits when this process does (its stdin closes), releasing the
// lock even if vitest crashes.
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";
import { checkSchema, localEnvironment, localExpectation } from "../scripts/test-db-schema.mjs";

const script = fileURLToPath(new URL("../scripts/test-db-lock.pl", import.meta.url));

export default async function holdTestDbLock(project: TestProject) {
  // Node closes extra descriptors on spawn unless they are explicitly passed.
  // Keep a parent proof's exclusive lock instead of using a different lock file.
  const stdio: ("pipe" | "inherit" | "ignore" | number)[] = ["pipe", "pipe", "inherit"];
  if (process.env.MGR_TEST_DB_LOCK_FD !== undefined) {
    const fd = Number(process.env.MGR_TEST_DB_LOCK_FD);
    if (!Number.isInteger(fd) || fd < 3 || fd > 255) throw new Error("test-db lock: invalid inherited descriptor");
    while (stdio.length < fd) stdio.push("ignore");
    stdio.push(fd);
  }
  const holder = spawn("perl", [script, "sh"], { stdio });
  const release = () => { holder.stdin!.end(); };
  try {
    await Promise.race([
      once(holder.stdout!, "data"),
      once(holder, "exit").then(() => { throw new Error("test-db lock: could not take the shared lock"); }),
      once(holder, "error").then(([error]) => { throw error; }),
    ]);
    const root = fileURLToPath(new URL("../", import.meta.url));
    // CI=true can be inherited locally; only the actual GitHub runner may
    // intentionally omit the pinned local file (including its pure-test job).
    const freshCI = process.env.GITHUB_ACTIONS === "true" && !existsSync(`${root}.env.test.local`);
    const env = freshCI ? project.config.env : localEnvironment(root);
    if (freshCI && !env.DATABASE_URL) return release;
    const expected = localExpectation(root);
    const identity = await checkSchema(env, expected);
    const revision = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    console.log(`test-db: locked ${JSON.stringify({ revision, expected, actual: identity, database: env.DATABASE_URL?.replace(/:[^:@/]+@/, ":***@"), api: env.NEXT_PUBLIC_SUPABASE_URL })}`);
    return async () => {
      try { await checkSchema(env, expected, identity); } finally { release(); }
    };
  } catch (error) {
    release();
    throw error;
  }
}
