// app/(app)/settings/channels/page.tsx — Sale channels (screen record,
// schema §16.3): the named ways this brewery sells, each with the tax
// treatment its removals are recorded under. Add and edit go through
// upsert_sale_channel (channel-form.tsx) and removal through
// delete_sale_channel (delete-channel-button.tsx), both admin-only. Wholesale
// is pinned by name (private.ship_order_impl looks it up that way) so it can
// be neither renamed nor deleted, and a channel a movement or price group
// references cannot be deleted either — both refusals surface inline.
import { SaleChannelsView } from "@/components/mgr/views/sale-channels";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toSaleChannelsViewProps } from "@/lib/mgr/sale-channels-view";
import "@/lib/commands/all";
import { ChannelForm } from "./channel-form";
import { DeleteChannelButton } from "./delete-channel-button";

type SaleChannel = { id: string; name: string; tax_treatment: string };

const TAX_INFO = "A channel’s tax treatment is the default for removals recorded on it. A customer may override it on their own record, and the resolved treatment is frozen onto each movement when it is recorded, so editing a channel later never restates a filed month.";

export default async function ChannelsPage() {
  const brewery = await getActiveBrewery();
  const channels = (await runCommand("list_sale_channels", {}, await buildContext(brewery.id))) as SaleChannel[];
  return (
    <SaleChannelsView
      model={toSaleChannelsViewProps({ channels, backHref: "/settings" })}
      createAction={<ChannelForm />}
      info={TAX_INFO}
      rowTrailing={(id) => {
        const c = channels.find((ch) => ch.id === id);
        if (!c) return null;
        return (
          <span className="flex items-center gap-2">
            <ChannelForm channel={{ id: c.id, name: c.name, taxTreatment: c.tax_treatment }} />
            <DeleteChannelButton channelId={c.id} />
          </span>
        );
      }}
    />
  );
}
