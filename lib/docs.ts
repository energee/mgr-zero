// lib/docs.ts — loader for the customer guides. Each guide is a body fragment
// in public/docs (semantic HTML, no head, no styles; next.config.ts redirects
// the raw .html path to the route) so that
// app/(docs)/docs/[guide] can render it inside the root layout and it inherits
// app/globals.css: fonts, tokens, dark mode, print rules. The documentation
// maintainer (.agents/agents/documentation-maintainer.md) edits the fragments.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const GUIDES = ["user-guide", "staff-guide", "portal-guide"] as const;
export type Guide = (typeof GUIDES)[number];

export function readGuide(guide: string): { html: string; title: string } {
  if (!GUIDES.includes(guide as Guide)) throw new Error(`unknown guide: ${guide}`);
  const html = readFileSync(join(process.cwd(), "public/docs", `${guide}.html`), "utf8");
  const title = /<h1>([^<]*)<\/h1>/.exec(html)?.[1] ?? "MGR guide";
  return { html, title };
}
