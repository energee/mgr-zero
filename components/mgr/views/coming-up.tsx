// components/mgr/views/coming-up.tsx — portal Coming up. Live passes linkRows
// so a brand row opens Shop at that brand; inventory leaves the taps unlabeled.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import type { ComingUpViewModel } from "@/lib/mgr/coming-up-view";

export type { ComingUpViewModel };

export function ComingUpView({ model, linkRows }: { model: ComingUpViewModel; linkRows?: boolean }) {
  return (
    <>
      {E.hd("Coming up", model.brewery)}
      {model.empty ? E.blank(model.empty) : model.rows.map((row) => (
        <Fragment key={row.key}>{E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, linkRows ? row.href : undefined)}</Fragment>
      ))}
      {E.info(model.info)}
    </>
  );
}
