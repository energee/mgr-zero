// scripts/lock-migrations.ts — rewrites supabase/migrations.lock.json, which
// pins the sha256 of every migration file. Run it after ADDING a migration;
// running it to silence a failure on an existing file re-breaks hosted, because
// `supabase db push` will never apply that file again (see #329, #330).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const DIR = "supabase/migrations";
const lock = Object.fromEntries(
  readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => [f, createHash("sha256").update(readFileSync(`${DIR}/${f}`)).digest("hex")]),
);
writeFileSync(`${DIR}.lock.json`, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`pinned ${Object.keys(lock).length} migrations`);
