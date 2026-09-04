// components/mdx.tsx — MDX component set for the guides: Fumadocs' defaults
// (Callout, Cards, Card, headings with anchors, tables). Add project components
// here if a guide ever needs one. ScreenIndex renders the screen inventory
// for content/docs/screens.mdx and ScreenExplorer its browsable twin
// (screens-explore.mdx); both are generated rather than written. Screen
// embeds one named frame under a guide section (<Screen name="Orders" />).
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { Screen } from "@/components/mgr/screen-embed";
import { ScreenExplorer } from "@/components/mgr/screen-explorer";
import { ScreenIndex } from "@/components/mgr/screen-index";
import { docIcon, type DocIconName } from "@/lib/mgr/doc-icons";

/** A named docs icon for MDX (`<Card icon={<DocIcon name="staff" />}>`). */
const DocIcon = ({ name }: { name: DocIconName }) => docIcon(name, 20);

export function getMDXComponents(components?: MDXComponents) {
  return { ...defaultMdxComponents, ScreenIndex, ScreenExplorer, Screen, DocIcon, ...components } satisfies MDXComponents;
}
