// components/mgr/views/work-kind-tabs.tsx — the Work kind strip (All · Orders ·
// Transfers · Batches · Packaging · Purchase orders · Deliveries, the sidebar
// names; WORK_LABELS). Every Work page draws it here, so it renders one way
// everywhere (#992). Live passes `hrefs`, the chips the role may open; the
// inventory draws every chip as an inert tab.
import { TabBar } from "@/components/mgr/qty";
import { WORK_LABELS } from "@/lib/mgr/work-view";

export function WorkKindTabs({ chips, current, tabs, hrefs }: {
  chips: string[];
  /** This page's chip identity, e.g. "orders". */
  current: string;
  /** Inventory destination per chip. */
  tabs: Record<string, string>;
  hrefs?: Record<string, string>;
}) {
  const names = hrefs ? chips.filter(name => hrefs[name]) : chips;
  return <TabBar names={names} on={names.indexOf(current)} cls="w-full overflow-x-auto justify-start scroll-cue" to={tabs} hrefs={hrefs} labels={WORK_LABELS} />;
}
