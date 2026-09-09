// components/mgr/views/brew-day.tsx — Brew day. Live slots RecordBrewDayForm
// or occupancy facts; inventory draws lots, knockout, and the tape.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { BrewDayViewModel } from "@/lib/mgr/brew-day-view";

export type { BrewDayViewModel };

export function BrewDayView({
  model,
  body,
}: {
  model: BrewDayViewModel;
  body?: ReactNode;
}) {
  return (
    <>
      {E.back("Batches", model.title, undefined, model.backHref)}
      {model.planned ? E.fld("Planned", model.planned) : null}
      {model.note ? E.fld("Note", model.note) : null}
      {body !== undefined
        ? body
        : (
          <>
            {(model.lots ?? []).map((lot) => (
              <Fragment key={lot.key}>{E.nav(lot.title, lot.detail)}</Fragment>
            ))}
            {E.fld("Knockout baseline", <>{model.knockoutFrom} {E.arrow()} {model.knockoutTo}</>)}
            {model.sheet ? E.nav(model.sheet.title, model.sheet.detail) : null}
            {E.tape([...(model.tapeHead ?? []), [<>Knockout {model.knockoutFrom} {E.arrow()} {model.knockoutTo}</>, "loss baseline"]])}
            {E.sp()}
            {E.btn("Record brew day", "irr")}
          </>
        )}
    </>
  );
}
