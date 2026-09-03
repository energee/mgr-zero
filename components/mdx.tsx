// components/mdx.tsx — MDX component set for the guides: Fumadocs' defaults
// (Callout, Cards, Card, headings with anchors, tables). Add project components
// here if a guide ever needs one. ScreenIndex renders the screen inventory
// for content/docs/screens.mdx, which is generated rather than written.
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { ScreenIndex } from "@/components/mgr/screen-index";

export function getMDXComponents(components?: MDXComponents) {
  return { ...defaultMdxComponents, ScreenIndex, ...components } satisfies MDXComponents;
}
