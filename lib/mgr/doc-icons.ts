// lib/mgr/doc-icons.ts — the icons the docs may use, by name. Fumadocs takes
// an icon *name* from a page's frontmatter and asks lib/source.ts to resolve
// it; the landing cards use the same names through <DocIcon /> in MDX. One
// map, so a page and its card cannot disagree, and a typo fails typecheck at
// the map rather than rendering nothing.
import {
  ArrowDataTransferHorizontalIcon, Factory01Icon, Layers01Icon, Store01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@/components/mgr/icon";

export const DOC_ICONS = {
  staff: Factory01Icon,
  portal: Store01Icon,
  screens: Layers01Icon,
  integrations: ArrowDataTransferHorizontalIcon,
} as const satisfies Record<string, IconSvgElement>;

export type DocIconName = keyof typeof DOC_ICONS;
