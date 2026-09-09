// components/mgr/views/channel.tsx — Channel sheet (inventory). Live
// create/edit stays channel-form.tsx.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ChannelViewModel } from "@/lib/mgr/channel-view";

export type { ChannelViewModel };

export function ChannelView({
  model,
  footer,
}: {
  model: ChannelViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.edit("Channel name", model.name)}
      {E.chips(model.taxOptions, model.taxIndex)}
      {E.info("Customers may override this. Sales without a customer take the channel default.")}
      {E.note("A channel with movements cannot be deleted.")}
      {footer !== undefined ? footer : E.btn("Save channel")}
    </>
  );
}
