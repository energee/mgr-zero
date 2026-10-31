// components/mgr/views/me.tsx — shared staff Me drawing inside MeSheet: who
// you are, your brewery, and your own settings, Chat and gravity unit (#1513).
import { Fragment, type ReactElement, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { SlackMark } from "@/components/mgr/brand-icons";
import { GravityUnitControls } from "@/components/mgr/views/units";
import { navAbout } from "@/lib/mgr/nav";
import type { MeViewModel } from "@/lib/mgr/me-view";

export function MeView({ model, footer, switchAction, avatar, chatHref, units }: {
  model: MeViewModel;
  footer?: ReactNode;
  switchAction?: (formData: FormData) => void | Promise<void>;
  avatar?: ReactElement;
  /** Live: /settings/chat. The inventory row stays inert. */
  chatHref?: string;
  /** Live: GravityUnitForm part="mine", or null when its read failed. Inventory draws model.units. */
  units?: ReactNode;
}) {
  return (
    <>
      {model.name ? E.row(model.name, model.roles.join(", "), "", "", avatar ?? E.face({ className: "size-10" })) : null}
      {E.fld("Signed in as", model.email)}
      {E.ttl("Brewery")}
      {model.breweries.map((brewery) => <Fragment key={brewery.id ?? brewery.name}>{E.row(
        brewery.name,
        "",
        brewery.current ? "✓" : switchAction && brewery.id ? (
          <form action={switchAction}>
            <input type="hidden" name="breweryId" value={brewery.id} />
            {E.act("Switch")}
          </form>
        ) : E.act("Switch"),
        brewery.current ? "ok" : "",
      )}</Fragment>)}
      {E.nav("Chat", navAbout("Chat"), "", SlackMark, chatHref)}
      {units !== undefined ? units : model.units && <GravityUnitControls model={model.units} part="mine" />}
      {E.sp()}
      {footer !== undefined ? footer : E.btns([["Guide", "g"], ["Change password", "g"], ["Sign out", "del"]])}
    </>
  );
}
