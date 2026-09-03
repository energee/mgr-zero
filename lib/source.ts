// lib/source.ts — Fumadocs content source for the customer guides. The MDX
// files in content/docs are compiled by fumadocs-mdx (see next.config.ts) into
// a typed collection; `source` exposes the page tree that app/(docs)/docs
// renders. The documentation maintainer edits content/docs/*.mdx.
import { loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";
import { createElement } from "react";
import { Icon } from "@/components/mgr/icon";
import { DOC_ICONS, type DocIconName } from "@/lib/mgr/doc-icons";

const docs = defineDocs({ dir: "content/docs" });

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  // Frontmatter `icon: staff` → the sidebar glyph (lib/mgr/doc-icons.ts).
  icon: (name) => (name && name in DOC_ICONS ? createElement(Icon, { icon: DOC_ICONS[name as DocIconName] }) : undefined),
});
