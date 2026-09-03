// components/mdx.tsx — MDX component set for the guides: Fumadocs' defaults
// (Callout, Cards, Card, headings with anchors, tables). Add project components
// here if a guide ever needs one. ScreenIndex renders the screen inventory
// for content/docs/screens.mdx, which is generated rather than written.
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { Icon } from "@/components/mgr/icon";
import { ScreenIndex } from "@/components/mgr/screen-index";
import { DOC_ICONS, type DocIconName } from "@/lib/mgr/doc-icons";

/** A named docs icon for MDX (`<Card icon={<DocIcon name="staff" />}>`). */
const DocIcon = ({ name }: { name: DocIconName }) => <Icon icon={DOC_ICONS[name]} size={20} />;

export function getMDXComponents(components?: MDXComponents) {
  return { ...defaultMdxComponents, ScreenIndex, DocIcon, ...components } satisfies MDXComponents;
}
