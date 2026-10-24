"use client";
// components/mgr/views/work-kind-tabs.tsx — the Work kind strip (All · Orders ·
// Transfers · Batches · Packaging · Purchase orders · Deliveries, the sidebar
// names; WORK_LABELS). Every Work page draws it here, so it renders one way
// everywhere (#992). Live passes `hrefs`, the chips the role may open; the
// inventory draws every chip as an inert tab.
import { useEffect, useRef } from "react";
import { TabBar } from "@/components/mgr/qty";
import { WORK_LABELS } from "@/lib/mgr/work-view";

type Span = { left: number; right: number };

/** How far to scroll `strip` sideways so `item` sits fully inside it, `pad`
 *  pixels clear of each edge. Negative scrolls left; 0 means it already fits. */
export function nearestScroll(strip: Span, item: Span, pad: number) {
  if (item.left < strip.left + pad) return item.left - strip.left - pad;
  if (item.right > strip.right - pad) return item.right - strip.right + pad;
  return 0;
}

export function WorkKindTabs({ chips, current, tabs, hrefs }: {
  chips: string[];
  /** This page's chip identity, e.g. "orders". */
  current: string;
  /** Inventory destination per chip. */
  tabs: Record<string, string>;
  hrefs?: Record<string, string>;
}) {
  const names = hrefs ? chips.filter(name => hrefs[name]) : chips;
  const box = useRef<HTMLDivElement>(null);
  // At phone width the strip scrolls, and a late tab such as Deliveries starts
  // off-screen (#1129). Scroll the strip, not scrollIntoView: that also scrolls
  // the page, and a docs page jumped when an inventory frame loaded. Setting
  // scrollLeft is instant, so it adds no motion. The pad is the scroll-cue
  // utility's scroll-padding (2rem on both edges, app/globals.css), which keeps
  // the tab clear of its edge fade.
  useEffect(() => {
    const strip = box.current?.querySelector<HTMLElement>('[role="tablist"]');
    const tab = strip?.querySelector('[aria-selected="true"]');
    if (!strip || !tab) return; // This role cannot open the page's own chip.
    const pad = parseFloat(getComputedStyle(strip).scrollPaddingInlineStart);
    strip.scrollLeft += nearestScroll(strip.getBoundingClientRect(), tab.getBoundingClientRect(), pad);
  }, [current]);
  return (
    <div ref={box} className="contents print:hidden">
      <TabBar names={names} on={names.indexOf(current)} cls="w-full overflow-x-auto justify-start scroll-cue" to={tabs} hrefs={hrefs} labels={WORK_LABELS} />
    </div>
  );
}
