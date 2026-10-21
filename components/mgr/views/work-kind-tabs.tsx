// components/mgr/views/work-kind-tabs.tsx — the Work kind strip (all · orders ·
// transfers · batches · runs · POs · routes). Every Work page draws it here, so
// it renders one way everywhere (#992). Live passes `hrefs`, the chips the
// role may open; the inventory draws every chip as an inert tab.
import { TabBar } from "@/components/mgr/qty";

export function WorkKindTabs({ chips, current, tabs, hrefs }: {
  chips: string[];
  /** This page's chip, e.g. "orders". */
  current: string;
  /** Inventory destination per chip. */
  tabs: Record<string, string>;
  hrefs?: Record<string, string>;
}) {
  const names = hrefs ? chips.filter(name => hrefs[name]) : chips;
  return <TabBar names={names} on={names.indexOf(current)} cls="w-full overflow-x-auto justify-start scroll-cue" to={tabs} hrefs={hrefs} />;
}
