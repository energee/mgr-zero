// components/mgr/views/short-pick.tsx — Short pick drawing. Inventory and the
// live sheet both pass toShortPickViewProps(get_order + the short line).
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ShortPickViewModel } from "@/lib/mgr/short-pick-view";

export type { ShortPickViewModel };

export function ShortPickView({
  model,
  footer,
  reason,
  resolution = 0,
}: {
  model: ShortPickViewModel;
  footer?: ReactNode;
  reason?: ReactNode;
  resolution?: number;
}) {
  return (
    <>
      {E.back(model.backTo, model.title, undefined, model.backHref)}
      {E.fld("Order · source", model.source)}
      {E.row(model.lineName, model.orderedLabel, E.stq(model.counted), "w")}
      {reason ?? E.nav("Reason", "required", "w")}
      {E.ttl(model.resolveTitle)}
      {E.chips(model.chips, resolution)}
      {resolution === 0
        ? E.info(<>Preview: order line {model.ordered} {E.arrow()} {model.counted}. Customer sees “adjusted”.</>)
        : E.info(<>Preview: {model.counted} staged · {model.missing} remain owed · the order keeps its Pick action.</>)}
      {E.sp()}
      {footer ?? E.btn(resolution === 0 ? model.verb : model.chips[1] ?? model.verb)}
    </>
  );
}
