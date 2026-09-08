// components/mgr/views/put-back.tsx — Put back drawing (staged restock).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PutBackViewModel } from "@/lib/mgr/put-back-view";

export type { PutBackViewModel };

export const PUT_BACK_EXEMPLAR: PutBackViewModel = {
  title: "ORD-0229 · put back",
  note: "3 Pils cases stayed staged after the line was adjusted. Put them back on the Warehouse shelf.",
  lines: [{ key: "pils", name: "Pils · 16 oz case", staged: "3" }],
  verb: "Put back 3 cases",
  showFixtureButton: true,
};

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
          {footer ?? (model.showFixtureButton && model.verb ? E.btn(model.verb) : null)}
        </>
      )}
    </>
  );
}
