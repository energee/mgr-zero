// components/mgr/views/new-po.tsx — New PO inventory drawing. Live create
// stays NewPoForm (E.stq / E.pick are not controlled CommandForm).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { NewPoViewModel } from "@/lib/mgr/new-po-view";

export type { NewPoViewModel };

export function NewPoView({ model, form }: { model: NewPoViewModel; form?: ReactNode }) {
  return (
    <>
      {E.back("Purchase orders", "New PO", undefined, model.backHref)}
      {form ?? (
        <>
          {E.nav("Vendor", model.vendor)}
          {E.edit("Expected", model.expected, "date")}
          {model.lines.map((line) => (
            <Fragment key={line.key}>
              {E.line(line.title, line.detail, E.stq(line.qty), "", <>
                {E.edit("Unit cost", line.cost)}
                {line.lot ? E.edit("Expected lot", line.lot) : null}
              </>)}
            </Fragment>
          ))}
          {E.btn("Add line", "g")}
          {E.sp()}
          {E.btn("Save draft")}
        </>
      )}
    </>
  );
}
