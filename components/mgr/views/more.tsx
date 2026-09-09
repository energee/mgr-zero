// components/mgr/views/more.tsx — More landing. Live passes role-filtered
// navs with hrefs; inventory draws the designed list unlabeled.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark } from "@/components/mgr/brand-icons";
import type { MoreViewModel } from "@/lib/mgr/more-view";

export type { MoreViewModel };

export function MoreView({
  model,
  navs,
  linkRows,
}: {
  model: MoreViewModel;
  navs?: ReactNode;
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd("More")}
      {navs !== undefined
        ? navs
        : model.navs.map((row) => (
          <Fragment key={row.key}>
            {E.nav(row.title, row.detail ?? "", "", row.mark === "qbo" ? QuickBooksMark : undefined, linkRows ? row.href : undefined)}
          </Fragment>
        ))}
    </>
  );
}
