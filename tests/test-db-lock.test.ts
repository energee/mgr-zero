// tests/test-db-lock.test.ts — scripts/test-db-lock.pl: vitest runs hold the
// test-database lock shared, scripts/test-db.sh holds it exclusive for a reset,
// and a holder that dies never leaves it held. Runs against a private lock file
// (MGR_TEST_DB_LOCK) so it never contends with this run's own shared hold.
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = "scripts/test-db-lock.pl";
const env = { ...process.env, MGR_TEST_DB_LOCK: join(mkdtempSync(join(tmpdir(), "mgr-lock-")), "lock") };

async function holdShared() {
  const holder = spawn("perl", [script, "sh"], { env, stdio: ["pipe", "pipe", "ignore"] });
  await Promise.race([
    once(holder.stdout, "data"),
    once(holder, "exit").then(() => { throw new Error("lock holder exited before locking"); }),
  ]);
  return holder;
}

const reset = (timeout: number) => spawnSync("perl", [script, "ex", "true"], { env, timeout });

describe("test database lock", () => {
  it("makes a reset wait for running tests", async () => {
    const tests = await holdShared();
    expect(reset(500).error).toMatchObject({ code: "ETIMEDOUT" });
    tests.stdin.end();
    await once(tests, "exit");
    expect(reset(5000).status).toBe(0);
  });

  it("lets test runs share it", async () => {
    const [a, b] = await Promise.all([holdShared(), holdShared()]);
    a.stdin.end();
    b.stdin.end();
  });

  it("makes a test run wait for a reset", async () => {
    const resetting = spawn("perl", [script, "ex", "sleep", "1"], { env });
    const resetDone = once(resetting, "exit");
    await new Promise((r) => setTimeout(r, 200));
    const started = Date.now();
    (await holdShared()).stdin.end();
    expect(Date.now() - started).toBeGreaterThan(500);
    await resetDone;
  });

  it("holds new test runs back while a reset waits, so resets never starve", async () => {
    const running = await holdShared();
    const resetting = spawn("perl", [script, "ex", "true"], { env });
    const resetDone = once(resetting, "exit");
    await new Promise((r) => setTimeout(r, 300));
    let later = false;
    const next = holdShared().then((h) => { later = true; return h; });
    await new Promise((r) => setTimeout(r, 300));
    expect(later).toBe(false);
    running.stdin.end();
    expect((await resetDone)[0]).toBe(0);
    (await next).stdin.end();
  });

  it("is released when its holder is killed", async () => {
    const tests = await holdShared();
    tests.kill("SIGKILL");
    await once(tests, "exit");
    expect(reset(5000).status).toBe(0);
  });
});
