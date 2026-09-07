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

// Replaces the block between one key's `ops:<key>` and `end ops:<key>` MDX
// comment markers (lib/mgr/api-reference.ts spells them), markers included.
const PATH = "content/docs/api.mdx";
function replace(page: string, key: string, block: string) {
  const start = page.indexOf(opsStart(key));
  const end = page.indexOf(opsEnd(key));
  if (start === -1 || end === -1) throw new Error(`${PATH} has no markers for ${key}`);
  // Out of order means the page was hand-edited into a state where slicing
  // would silently delete the text between them; say so instead.
  if (end < start) throw new Error(`${PATH} closes the ${key} block before it opens it`);
  console.log(`${PATH}: ${key}`);
  return page.slice(0, start) + block.trimEnd() + page.slice(end + opsEnd(key).length);
}

// One read and one write: the blocks are independent, so rewriting the file
// once per block only meant re-reading what this pass had just written.
let page = readFileSync(PATH, "utf8");
for (const area of API_AREAS) page = replace(page, area.slug, renderArea(area.slug));
page = replace(page, "roles", renderRoleMatrix());
page = replace(page, "errors", renderErrors());
writeFileSync(PATH, page);

// The same derivation, as the plan of record for the backend push.
writeFileSync(BACKLOG_PATH, renderBacklog());
console.log(`${BACKLOG_PATH}: backlog`);
