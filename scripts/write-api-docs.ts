// scripts/write-api-docs.ts — writes every generated block in the HTTP API
// reference, leaving the prose alone: each area's operations block in
// content/docs/api/<area>.mdx, and the role matrix and error catalogue in
// content/docs/api/index.mdx. Run it after registering, renaming or removing a
// command, after a screen names a new operation, or after changing
// lib/mgr/api-errors.ts. It also rewrites the backend backlog plan:
// `bun run docs:api`. tests/api-docs.test.ts fails until you do.
import { readFileSync, writeFileSync } from "node:fs";
import { API_AREAS } from "@/lib/mgr/api-operations";
import { BACKLOG_PATH, opsEnd, opsStart, renderArea, renderBacklog, renderErrors, renderRoleMatrix } from "@/lib/mgr/api-reference";

// Replaces the block between one key's `ops:<key>` and `end ops:<key>` MDX
// comment markers (lib/mgr/api-reference.ts spells them), markers included.
function replace(path: string, page: string, key: string, block: string) {
  const start = page.indexOf(opsStart(key));
  const end = page.indexOf(opsEnd(key));
  if (start === -1 || end === -1) throw new Error(`${path} has no markers for ${key}`);
  // Out of order means the page was hand-edited into a state where slicing
  // would silently delete the text between them; say so instead.
  if (end < start) throw new Error(`${path} closes the ${key} block before it opens it`);
  console.log(`${path}: ${key}`);
  return page.slice(0, start) + block.trimEnd() + page.slice(end + opsEnd(key).length);
}

// Rewrites the named blocks of one page with one read and one write. A new
// area needs its page written by hand first (title, description, prose, and
// the two markers) and a line in content/docs/api/meta.json.
function rewrite(path: string, blocks: [key: string, block: string][]) {
  let page = readFileSync(path, "utf8");
  for (const [key, block] of blocks) page = replace(path, page, key, block);
  writeFileSync(path, page);
}

for (const area of API_AREAS) rewrite(`content/docs/api/${area.slug}.mdx`, [[area.slug, renderArea(area.slug)]]);
rewrite("content/docs/api/index.mdx", [["roles", renderRoleMatrix()], ["errors", renderErrors()]]);

// The same derivation, as the plan of record for the backend push.
writeFileSync(BACKLOG_PATH, renderBacklog());
console.log(`${BACKLOG_PATH}: backlog`);
