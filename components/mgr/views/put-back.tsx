// components/mgr/views/put-back.tsx — Put back drawing (staged restock).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PutBackViewModel } from "@/lib/mgr/put-back-view";

export type { PutBackViewModel };

export function PutBackView({ model, footer }: { model: PutBackViewModel; footer?: ReactNode }) {
  return (
    <>
      {E.back("Today", model.title, undefined, model.backHref)}
      {model.empty ? E.blank("Nothing to put back: the flag is already clear") : (
        <>
          {model.note ? E.note(model.note) : null}
          {model.lines.map((line) => (
            <Fragment key={line.key}>{E.row(line.name, "staged after pick", line.staged, "w")}</Fragment>
          ))}
          {E.sp()}
          {footer ?? (model.verb ? E.btn(model.verb) : null)}
        </>
      )}
    </>
  );
}
