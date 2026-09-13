// components/mgr/views/more.tsx — More landing. The model supplies role-filtered
// live navs with hrefs; inventory draws the designed list unlabeled.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark } from "@/components/mgr/brand-icons";
import type { MoreViewModel } from "@/lib/mgr/more-view";

export type { MoreViewModel };

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
      {model.navs.map((row) => (
        <Fragment key={row.key}>
          {E.nav(row.title, row.detail ?? "", "", row.mark === "qbo" ? QuickBooksMark : undefined, linkRows ? row.href : undefined)}
        </Fragment>
      ))}
    </>
  );
}
