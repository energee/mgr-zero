// components/mdx.tsx — MDX component set for the guides: Fumadocs' defaults
// (Callout, Cards, Card, headings with anchors, tables). Add project components
// here if a guide ever needs one.
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

export function getMDXComponents(components?: MDXComponents) {
  return { ...defaultMdxComponents, ...components } satisfies MDXComponents;
}
