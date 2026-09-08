// app/(app)/settings/channels/page.tsx — Sale channels (screen record,
// schema §16.3): the named ways this brewery sells, each with the tax
// treatment its removals are recorded under. Add and edit go through
// upsert_sale_channel (channel-form.tsx) and removal through
// delete_sale_channel (delete-channel-button.tsx), both admin-only. Wholesale
// is pinned by name (private.ship_order_impl looks it up that way) so it can
// be neither renamed nor deleted, and a channel a movement or price group
// references cannot be deleted either — both refusals surface inline.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { ChannelForm } from "./channel-form";
import { treatmentLabel } from "./tax-treatments";
import { DeleteChannelButton } from "./delete-channel-button";

type SaleChannel = { id: string; name: string; tax_treatment: string };

export default async function ChannelsPage() {
  const brewery = await getActiveBrewery();
  const channels = (await runCommand("list_sale_channels", {}, await buildContext(brewery.id))) as SaleChannel[];
  return (
    <>
      {E.back("Settings", "Sale channels", <ChannelForm />, "/settings")}
      {E.info("A channel’s tax treatment is the default for removals recorded on it. A customer may override it on their own record, and the resolved treatment is frozen onto each movement when it is recorded, so editing a channel later never restates a filed month.")}
      {channels.length === 0 ? E.blank("No sale channels yet") : channels.map((c) => (
        <div key={c.id}>{E.row(c.name, treatmentLabel(c.tax_treatment), <span className="flex items-center gap-2"><ChannelForm channel={{ id: c.id, name: c.name, taxTreatment: c.tax_treatment }} /><DeleteChannelButton channelId={c.id} /></span>)}</div>
      ))}
    </>
  );
}
