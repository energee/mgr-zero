// app/(app)/settings/channels/page.tsx — Sale channels (screen record,
// schema §16.3): the named ways this brewery sells, each with the tax
// treatment its removals are recorded under. Add and edit go through
// upsert_sale_channel (channel-form.tsx) and removal through
// delete_sale_channel (DeleteChannelControl, confirmed first), both admin-only, so the
// controls are drawn only for a role that may run them (#478). No channel
// name is load-bearing (an order carries its own sale_channel_id, which
// private.ship_order_impl reads), so any channel may be renamed; a channel a
// movement, customer, order, price cell or Square menu references cannot be
// deleted, and neither can the system Taproom channel. list_sale_channels
// says which rows are in use, so Delete shows only where it would succeed
// (#1207); the rule (CHANNEL_IN_USE_RULE) is stated in the delete confirm (#1518).
import { DeleteChannelControl } from "@/components/mgr/views/delete-channel";
import { SaleChannelsView } from "@/components/mgr/views/sale-channels";
import { DeleteCommandButton } from "../../delete-command-button";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { canRun } from "@/lib/commands/registry";
import { canOpen, navTitle } from "@/lib/mgr/nav";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toSaleChannelsViewProps, type SaleChannelsSnapshot } from "@/lib/mgr/sale-channels-view";
import "@/lib/commands/all";
import { ChannelForm } from "./channel-form";

export const metadata = { title: navTitle("/settings/channels") };

export default async function ChannelsPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const channels = (await runCommand("list_sale_channels", {}, ctx)) as SaleChannelsSnapshot["channels"];
  const canEdit = canRun(ctx, "upsert_sale_channel"), canDelete = canRun(ctx, "delete_sale_channel");
  // Settings is admin-only; sales and warehouse return to More (#444).
  const toSettings = canOpen(brewery.roles, "/settings");
  return (
    <SaleChannelsView
      model={toSaleChannelsViewProps({ channels, canDelete, backHref: toSettings ? "/settings" : "/more" })}
      backLabel={toSettings ? "Settings" : "More"}
      createAction={canEdit ? <ChannelForm /> : null}
      rowTrailing={(row) => {
        const c = channels.find((ch) => ch.id === row.key);
        if (!c || (!canEdit && !row.deletable)) return null;
        return (
          <span className="flex items-center gap-2">
            {canEdit && <ChannelForm channel={{ id: c.id, name: c.name, taxTreatment: c.tax_treatment }} />}
            {row.deletable && <DeleteCommandButton control={DeleteChannelControl} command="delete_sale_channel" input={{ channelId: c.id }} name={c.name} redirect="/settings/channels" />}
          </span>
        );
      }}
    />
  );
}
