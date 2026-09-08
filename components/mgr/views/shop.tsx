// components/mgr/views/shop.tsx — Shop drawing. Live passes Cart as catalog
// and omits footer / comingUp (Cart already has Submit). Inventory draws
// brand/qty rows, Coming up, ship-to, and Review order from the model.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ShopViewModel } from "@/lib/mgr/shop-view";

export type { ShopViewModel };

export function ShopView({
  model,
  catalog,
  footer,
  comingUp,
}: {
  model: ShopViewModel;
  /** Live: <Cart />. Inventory omits this and draws model.groups. */
  catalog?: ReactNode;
  /** Live passes null — Cart has Submit. Inventory draws ship-to + Review. */
  footer?: ReactNode;
  /** Live passes null (Coming up is SCHEMA-GATE). Inventory draws the nav. */
  comingUp?: ReactNode;
}) {
  return (
    <>
      {E.hd("Order", model.customer)}
      {catalog !== undefined ? catalog : model.empty ? E.blank(model.empty) : model.groups.map((group) => (
        <Fragment key={group.product}>
          {E.ttl(group.product)}
          {group.items.map((item) => (
            <Fragment key={item.key}>
              {E.row(item.name, item.price, E.stq(item.qty, item.name))}
            </Fragment>
          ))}
        </Fragment>
      ))}
      {comingUp !== undefined ? comingUp : E.nav("Coming up", "what’s brewing next")}
      {footer !== undefined ? footer : (
        <>
          {E.row("Ships from", model.source)}
          {E.row("Ship-to · requested date", model.shipToLine, E.act("Change"))}
          {E.sp()}
          {E.info(model.depositInfo)}
          {E.btn(model.reviewVerb, "p")}
        </>
      )}
    </>
  );
}
