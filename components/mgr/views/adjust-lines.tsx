// components/mgr/views/adjust-lines.tsx — Adjust lines sheet. Inventory
// mounts this view. Live create/edit stays adjust-lines-form.tsx (CommandForm;
// E.stq is not a controlled input).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { AdjustLinesViewModel } from "@/lib/mgr/adjust-lines-view";

export type { AdjustLinesViewModel };

export function AdjustLinesView({
  model,
  footer,
  reason = "",
}: {
  model: AdjustLinesViewModel;
  footer?: ReactNode;
  reason?: string;
}) {
  return (
    <>
      {E.back(model.backTo, model.title, undefined, model.backHref)}
      {model.lines.map((line) => (
        <Fragment key={line.key}>{E.row(line.name, line.detail, E.stq(line.qty), line.tone ?? "")}</Fragment>
      ))}
      {E.edit("Reason", reason)}
      {footer ?? E.btn("Save lines")}
    </>
  );
}
