// scripts/write-api-docs.ts — writes every generated block in the HTTP API
// reference (content/docs/api.mdx, one page so the rail tracks the scroll),
// leaving the prose alone: one operations block per area, the role matrix,
// and the error catalogue. Run it after registering, renaming or removing a command, after a
// screen names a new operation, or after changing lib/mgr/api-errors.ts. It also
// rewrites the backend backlog plan:
// `bun run docs:api`. tests/api-docs.test.ts fails until you do.
import { readFileSync, writeFileSync } from "node:fs";
import { API_AREAS } from "@/lib/mgr/api-operations";
import { BACKLOG_PATH, opsEnd, opsStart, renderArea, renderBacklog, renderErrors, renderRoleMatrix } from "@/lib/mgr/api-reference";

/** Replaces one `{/* ops:<key> *​/}` … `{/* end ops:<key> *​/}` block in a page. */
const PATH = "content/docs/api.mdx";
function write(key: string, block: string) {
  const path = PATH;
  const current = readFileSync(path, "utf8");
  const start = current.indexOf(opsStart(key));
  const end = current.indexOf(opsEnd(key));
  if (start === -1 || end === -1) throw new Error(`${path} has no markers for ${key}`);
  writeFileSync(path, current.slice(0, start) + block.trimEnd() + current.slice(end + opsEnd(key).length));
  console.log(`${path}: ${key}`);
}

for (const area of API_AREAS) write(area.slug, renderArea(area.slug));
write("roles", renderRoleMatrix());
write("errors", renderErrors());

// The same derivation, as the plan of record for the backend push.
writeFileSync(BACKLOG_PATH, renderBacklog());
console.log(`${BACKLOG_PATH}: backlog`);
