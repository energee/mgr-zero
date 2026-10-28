// lib/docs-sidebar.ts — the docs sidebar staff browse. Screen inventory,
// Screen explorer and the HTTP API are developer pages: they stay published
// and linked (the chooser links the API reference), but the sidebar leaves
// them out (#1517). app/(docs)/docs/layout.tsx draws the filtered tree.
import type { Node, Root } from "fumadocs-core/page-tree";

const DEVELOPER_PAGES = new Set(["/docs/screens", "/docs/screens-explore", "/docs/api"]);

/** The URL a sidebar node opens: a page's own, or a folder's index page (its
 *  `index`, or its first child when meta.json lists the index as a page). */
function nodeUrl(node: Node): string | undefined {
  if (node.type === "page") return node.url;
  if (node.type !== "folder") return undefined;
  const first = node.children[0];
  return node.index?.url ?? (first?.type === "page" ? first.url : undefined);
}

/** The page tree without the developer pages. */
export function staffSidebar(tree: Root): Root {
  return { ...tree, children: tree.children.filter((node) => !DEVELOPER_PAGES.has(nodeUrl(node) ?? "")) };
}
