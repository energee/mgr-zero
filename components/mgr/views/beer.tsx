// components/mgr/views/beer.tsx — Beer landing. Live passes navs when the
// taproom staff drawing (count/board/variance + stock) replaces the inventory
// area summaries.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { BeerViewModel } from "@/lib/mgr/beer-view";

export type { BeerViewModel };

export function BeerView({
  model,
  navs,
  blank,
  linkRows,
}: {
  model: BeerViewModel;
  navs?: ReactNode;
  blank?: ReactNode;
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd("Beer")}
      {navs !== undefined
        ? navs
        : model.navs.map((row) => (
          <Fragment key={row.key}>
            {E.nav(row.title, row.detail, "", undefined, linkRows ? row.href : undefined)}
          </Fragment>
        ))}
      {blank !== undefined ? blank : E.blank(model.blank)}
    </>
  );
}
