// scripts/lock-migrations.ts — adds missing hashes to supabase/migrations.lock.json.
// Existing pins are never rewritten or dropped: `supabase db push` will never
// apply an existing version again (see #329, #330). Run after ADDING a migration.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const DIR = "supabase/migrations";
const lock = JSON.parse(readFileSync(`${DIR}.lock.json`, "utf8")) as Record<string, string>;
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
  if (!Object.hasOwn(lock, file)) {
    lock[file] = createHash("sha256").update(readFileSync(`${DIR}/${file}`)).digest("hex");
  }
}
const sorted = Object.fromEntries(Object.keys(lock).sort().map((file) => [file, lock[file]]));
writeFileSync(`${DIR}.lock.json`, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`pinned ${Object.keys(lock).length} migrations`);
