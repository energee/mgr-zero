import { E } from "@/components/mgr/e";

export type HistoryNavigationProps = { moreHref?: string; firstHref?: string };

export function HistoryNavigation({ moreHref, firstHref }: HistoryNavigationProps) {
  if (!moreHref && !firstHref) return null;
  return <nav aria-label="History pages" className="flex gap-2">
    {firstHref && E.act("Newest", undefined, firstHref)}
    {moreHref && E.act("More", "primary", moreHref)}
  </nav>;
}
