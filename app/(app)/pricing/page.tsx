// app/(app)/pricing/page.tsx — Price groups (screen record): the price grid,
// one sale channel at a time (?channel=<id>, the first by default), price
// groups down and formats across. Reads list_sale_channels, list_price_groups,
// list_formats, list_channel_prices (the whole grid in one read) and
// list_price_group_barcodes. PriceGroupsView draws the tabs and table; this
// page fills its slots: every cell edits in place through set_channel_price /
// clear_channel_price (PriceCellForm, keyed on its value so a save or clear
// remounts it), a pour column on a group without that pour opens PourForm
// with the name filled in, and each group name opens GroupForm, which also
// creates.
import { PriceGroupsView, addPourTrigger } from "@/components/mgr/views/price-groups";
import { toPriceGroupsViewProps } from "@/lib/mgr/price-groups-view";
import { toPriceGroupViewProps } from "@/lib/mgr/price-group-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { PourForm } from "@/app/(app)/catalog/pour-form";
import { PriceCellForm } from "./price-cell-form";
import { GroupForm } from "./group-form";
import type { PriceGroupBarcode, PriceGroupRow, PriceGroupsSnapshot } from "@/lib/mgr/price-groups-view";

export default async function PricingPage({ searchParams }: { searchParams?: Promise<{ channel?: string }> } = {}) {
  const { channel: channelId } = (await searchParams) ?? {};
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [channels, groups, formats, cells, barcodes] = (await Promise.all([
    runCommand("list_sale_channels", {}, ctx), runCommand("list_price_groups", {}, ctx), runCommand("list_formats", {}, ctx), runCommand("list_channel_prices", {}, ctx),
    runCommand("list_price_group_barcodes", {}, ctx),
  ])) as [PriceGroupsSnapshot["channels"], PriceGroupRow[], PriceGroupsSnapshot["formats"], PriceGroupsSnapshot["cells"], PriceGroupBarcode[]];
  const snapshot = { channels, groups, formats, cells, barcodes };
  const model = toPriceGroupsViewProps({ ...snapshot, channelId, channelHref: (id) => `/pricing?channel=${id}` });
  // One editor model per group, not per group per channel.
  const groupModel = new Map(groups.map((g) => [g.id, toPriceGroupViewProps({ ...snapshot, groupId: g.id })]));
  return (
    <PriceGroupsView
      model={model}
      backHref="/more"
      createAction={<GroupForm model={toPriceGroupViewProps(snapshot)} />}
      renderGroup={(row) => <GroupForm groupId={row.id} model={groupModel.get(row.id)!} />}
      // PriceGroupsView asks for a cell only where the row has a format.
      renderCell={(channel, row, col, value) => <PriceCellForm key={value ?? "empty"} saleChannelId={channel.id} priceGroupId={row.id} formatId={row.formatIds[col]!} value={value} groupName={row.name} formatName={model.formats[col]!} channelName={channel.name} />}
      renderAddPour={(row, pour) => <PourForm priceGroupId={row.id} groupName={row.name} name={pour} trigger={addPourTrigger(pour, row.name)} />}
    />
  );
}
