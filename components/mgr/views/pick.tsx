// components/mgr/views/pick.tsx — Pick drawing. Inventory and the live form
// both pass toPickViewProps(get_order-shaped data).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PickViewModel } from "@/lib/mgr/pick-view";

export type { PickViewModel };

export function PickView({
  model,
  footer,
}: {
  model: PickViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.back(model.backTo, model.title, undefined, model.backHref)}
      {E.info(model.info)}
      {model.lines.map((line) => (
        <Fragment key={line.key}>{E.row(line.name, line.detail, E.stq(line.qty), line.tone ?? "")}</Fragment>
      ))}
      {E.btn("Print pick sheet", "g")}
      {E.sp()}
      {footer ?? E.btn("Done picking")}
    </>
  );
}
