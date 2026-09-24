// tests/test-db-lock.setup.ts — vitest globalSetup: hold scripts/test-db-lock.pl
// shared for the whole run, so scripts/test-db.sh never resets the shared test
// database under it and this run waits out a reset already in progress. The
// perl holder exits when this process does (its stdin closes), releasing the
// lock even if vitest crashes.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/test-db-lock.pl", import.meta.url));

export default async function holdTestDbLock() {
  const holder = spawn("perl", [script, "sh"], { stdio: ["pipe", "pipe", "inherit"] });
  await Promise.race([
    once(holder.stdout, "data"),
    once(holder, "exit").then(() => { throw new Error("test-db lock: could not take the shared lock"); }),
  ]);
  return () => { holder.stdin.end(); };
}
