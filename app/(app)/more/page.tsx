// app/(app)/more/page.tsx — More: setup and desk review, never standing work.
// The rows are the role's More entries from the navigation manifest
// (lib/mgr/nav.ts), so a hidden entry leaves no gap and a planned one never
// appears; the phone More tab lands here instead of on the first child.
import { MoreView } from "@/components/mgr/views/more";
import { getActiveBrewery } from "@/lib/brewery";
import { navFor, shippedNav, STAFF_NAV } from "@/lib/mgr/nav";
import { toMoreViewProps } from "@/lib/mgr/more-view";

export default async function MorePage() {
  const brewery = await getActiveBrewery();
  const items = navFor(shippedNav(STAFF_NAV), brewery.role).find((t) => t.label === "More")?.children ?? [];
  return (
    <MoreView
      model={toMoreViewProps(items.map((c) => ({ key: c.href, title: c.label, detail: c.about ?? "", href: c.href })))}
      linkRows
    />
  );
}
