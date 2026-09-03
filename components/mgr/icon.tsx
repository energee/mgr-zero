// components/mgr/icon.tsx — the one way an icon enters MGR's own UI. Wraps
// Hugeicons so every placement shares a treatment: 16px in rows and alerts,
// 20px in the tab bar, stroke 1.5, currentColor, and aria-hidden — the text
// beside an icon is its label, so the glyph is never announced twice. Icons
// never take a color of their own; attention stays with the row's dot. Where
// icons may appear at all is decided in docs/plans/hugeicons.md, not here.
// shadcn's own chrome (chevrons, close marks) keeps Lucide inside components/ui.
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

export type { IconSvgElement };

export function Icon({ icon, size = 16, className }: { icon: IconSvgElement; size?: 16 | 20; className?: string }) {
  // Hugeicons puts its stroke on every element after the element's own
  // attributes, so a filled mark (brand-icons.tsx) gets no stroke at all.
  const filled = icon[0]?.[1].fill !== undefined;
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={filled ? undefined : 1.5} aria-hidden className={cn("shrink-0", className)} />;
}
