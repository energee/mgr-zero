import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import type { BeerViewModel } from "@/lib/mgr/beer-view";

export type { BeerViewModel };

export function BeerView({
  model,
  linkRows,
}: {
  model: BeerViewModel;
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd("Beer")}
      {model.navs.map((row) => (
          <Fragment key={row.key}>
            {E.nav(row.title, row.detail, "", undefined, linkRows ? row.href : undefined)}
          </Fragment>
        ))}
      {model.stock !== undefined && <section id="taproom">
        {E.ttl("Taproom stock")}
        {model.stock.length ? model.stock.map(row => <Fragment key={row.key}>{E.row(row.title, row.detail, row.qty)}</Fragment>) : E.blank(model.stockEmpty ?? "No stock recorded")}
      </section>}
      {model.blank ? E.blank(model.blank) : null}
    </>
  );
}
