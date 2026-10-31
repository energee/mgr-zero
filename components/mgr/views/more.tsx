// components/mgr/views/more.tsx — More landing. The model supplies role-filtered
// live navs with hrefs, grouped under their area headings; inventory draws the
// designed list unlinked.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark } from "@/components/mgr/brand-icons";
import type { MoreViewModel } from "@/lib/mgr/more-view";

export function MoreView({
  model,
  linkRows,
}: {
  model: MoreViewModel;
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd("More")}
      {model.groups.map(({ group, items }) => (
        <Fragment key={group ?? ""}>
          {group && E.ttl(group)}
          {items.map((row) => (
            <Fragment key={row.key}>
              {E.nav(row.title, row.detail ?? "", "", row.mark === "qbo" ? QuickBooksMark : undefined, linkRows ? row.href : undefined)}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </>
  );
}
