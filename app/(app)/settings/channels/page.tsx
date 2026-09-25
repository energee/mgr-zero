// app/(app)/settings/channels/page.tsx — Sale channels (screen record,
// schema §16.3): the named ways this brewery sells, each with the tax
// treatment its removals are recorded under. Add and edit go through
// upsert_sale_channel (channel-form.tsx) and removal through
// delete_sale_channel (delete-channel-button.tsx), both admin-only, so the
// controls are drawn only for a role that may run them (#478). No channel
// name is load-bearing (an order carries its own sale_channel_id, which
// private.ship_order_impl reads), so any channel may be renamed; a channel a
// movement, customer, order or price cell references cannot be deleted, a
// refusal that surfaces inline.
import { SaleChannelsView } from "@/components/mgr/views/sale-channels";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { canRun } from "@/lib/commands/registry";
import { canOpen } from "@/lib/mgr/nav";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toSaleChannelsViewProps } from "@/lib/mgr/sale-channels-view";
import "@/lib/commands/all";
import { ChannelForm } from "./channel-form";
import { DeleteChannelButton } from "./delete-channel-button";

type SaleChannel = { id: string; name: string; tax_treatment: string };

const TAX_INFO = "A channel’s tax treatment is the default for removals recorded on it. A customer may override it on their own record, and the resolved treatment is frozen onto each movement when it is recorded, so editing a channel later never restates a filed month.";

export default async function ChannelsPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const channels = (await runCommand("list_sale_channels", {}, ctx)) as SaleChannel[];
  const canEdit = canRun(ctx, "upsert_sale_channel"), canDelete = canRun(ctx, "delete_sale_channel");
  // Settings is admin-only; sales and warehouse return to More (#444).
  const toSettings = canOpen(brewery.role, "/settings");
  return (
    <SaleChannelsView
      model={toSaleChannelsViewProps({ channels, backHref: toSettings ? "/settings" : "/more" })}
      backLabel={toSettings ? "Settings" : "More"}
      createAction={canEdit ? <ChannelForm /> : null}
      info={TAX_INFO}
      rowTrailing={(id) => {
        const c = channels.find((ch) => ch.id === id);
        if (!c || (!canEdit && !canDelete)) return null;
        return (
          <span className="flex items-center gap-2">
            {canEdit && <ChannelForm channel={{ id: c.id, name: c.name, taxTreatment: c.tax_treatment }} />}
            {canDelete && <DeleteChannelButton channelId={c.id} />}
          </span>
        );
      }}
    />
  );
}
