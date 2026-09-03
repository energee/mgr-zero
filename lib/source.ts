// lib/source.ts — Fumadocs content source for the customer guides. The MDX
// files in content/docs are compiled by fumadocs-mdx (see next.config.ts) into
// a typed collection; `source` exposes the page tree that app/(docs)/docs
// renders. The documentation maintainer edits content/docs/*.mdx.
import { loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";

const docs = defineDocs({ dir: "content/docs" });

export const source = loader({ baseUrl: "/docs", source: docs.toFumadocsSource() });
