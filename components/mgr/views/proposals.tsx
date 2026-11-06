// components/mgr/views/proposals.tsx — the changes a person's agents have proposed
// that are still waiting for their approval.
import { E } from "@/components/mgr/e";

export function ProposalsView({ rows, backHref }: { rows: { id: string; title: string; detail: string; href: string }[]; backHref?: string }) {
  return <>
    {E.back("Today", "Changes to approve", undefined, backHref)}
    {rows.length
      ? rows.map(row => <div key={row.id}>{E.nav(row.title, row.detail, "", undefined, row.href)}</div>)
      : E.blank("Nothing is waiting for your approval.")}
  </>;
}
