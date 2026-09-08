// components/mgr/work-tabs.tsx — the live Work chip bar and its sibling state
// bar: one Tabs list whose triggers are links, so a chip is a navigation, not
// client state. Pages under Work draw it under E.hd("Work", …) exactly as the
// screen records draw E.tabs(WORK_CHIPS, …).
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** The Work chips and where each one goes. */
export const WORK_CHIPS: [label: string, href: string][] = [
  ["all", "/work"], ["orders", "/orders"], ["transfers", "/transfers"], ["batches", "/batches"], ["runs", "/packaging"], ["POs", "/purchase-orders"], ["routes", "/routes"],
];

export function LinkTabs({ items, current, className = "w-full" }: { items: [label: string, href: string][]; current: string; className?: string }) {
  return (
    <Tabs value={current} className="min-w-0">
      <TabsList variant="solid" className={className}>
        {items.map(([label, href]) => <TabsTrigger key={label} value={label} asChild><Link href={href}>{label}</Link></TabsTrigger>)}
      </TabsList>
    </Tabs>
  );
}
