// components/mgr/views/me.tsx — shared staff Me drawing inside MeSheet.
import { Fragment, type ReactElement, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { MeViewModel } from "@/lib/mgr/me-view";

export type { MeViewModel };

export function MeView({ model, footer, switchAction, avatar }: {
  model: MeViewModel;
  footer?: ReactNode;
  switchAction?: (formData: FormData) => void | Promise<void>;
  avatar?: ReactElement;
}) {
  return (
    <>
      {model.name ? E.row(model.name, model.role, "", "", avatar ?? E.face({ className: "size-10" })) : null}
      {E.fld("Signed in as", model.email)}
      {E.ttl("Brewery")}
      {model.breweries.map((brewery) => <Fragment key={brewery.id ?? brewery.name}>{E.row(
        brewery.name,
        brewery.current ? "current" : "",
        brewery.current ? "✓" : switchAction && brewery.id ? (
          <form action={switchAction}>
            <input type="hidden" name="breweryId" value={brewery.id} />
            {E.act("Switch")}
          </form>
        ) : E.act("Switch"),
        brewery.current ? "ok" : "",
      )}</Fragment>)}
      {E.sp()}
      {footer !== undefined ? footer : E.btns([["Change password", "g"], ["Sign out", "del"]])}
    </>
  );
}
