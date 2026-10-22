// components/mgr/work-tabs.tsx — where each Work chip goes for a role
// (workHrefsFor, read by views/work-kind-tabs.tsx) and LinkTabs, a tab list
// whose triggers are links, so a tab is a navigation, not client state.
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { navFor, STAFF_NAV } from "@/lib/mgr/nav";
import type { StaffRole } from "@/lib/commands/registry";
import { WORK_HREFS } from "@/lib/mgr/work-view";

/** Each Work chip the role may open, keyed by chip identity, with its page. */
export function workHrefsFor(roles: readonly StaffRole[]) {
  const work = navFor(STAFF_NAV, roles).find(item => item.href === "/work");
  return Object.fromEntries(Object.entries(WORK_HREFS).filter(([, href]) => href === work?.href || work?.children?.some(item => item.href === href)));
}

export function LinkTabs({ items, current, className = "w-full" }: { items: [label: string, href: string][]; current: string; className?: string }) {
  return (
    <Tabs value={current} className="min-w-0">
      <TabsList variant="solid" className={className}>
        {items.map(([label, href]) => <TabsTrigger key={label} value={label} asChild><Link href={href}>{label}</Link></TabsTrigger>)}
      </TabsList>
    </Tabs>
  );
}
