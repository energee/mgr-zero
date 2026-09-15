// app/(app)/pricing/page.tsx — Price groups (screen record): the price grid,
// one table per sale channel, price groups down and formats across. Reads
// list_sale_channels, list_price_groups, list_formats and list_channel_prices
// (the whole grid in one read). PriceGroupsView draws the table; this page
// fills its slots: every cell edits through set_channel_price /
// clear_channel_price (PriceCellForm, keyed on its value so a save or clear
// remounts it), and each group name opens GroupForm, which also creates.
import { PriceGroupsView } from "@/components/mgr/views/price-groups";
import { cellKey, toPriceGroupsViewProps } from "@/lib/mgr/price-groups-view";
import { toPriceGroupViewProps } from "@/lib/mgr/price-group-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { PriceCellForm } from "./price-cell-form";
import { GroupForm } from "./group-form";
import type { PriceGroupRow, PriceGroupsSnapshot } from "@/lib/mgr/price-groups-view";

export default async function PricingPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [channels, groups, formats, cells] = (await Promise.all([
    runCommand("list_sale_channels", {}, ctx), runCommand("list_price_groups", {}, ctx), runCommand("list_formats", {}, ctx), runCommand("list_channel_prices", {}, ctx),
  ])) as [PriceGroupsSnapshot["channels"], PriceGroupRow[], PriceGroupsSnapshot["formats"], PriceGroupsSnapshot["cells"]];
  const snapshot = { channels, groups, formats, cells };
  const model = toPriceGroupsViewProps(snapshot);
  const cents = new Map(cells.map((c) => [cellKey(c.sale_channel_id, c.price_group_id, c.format_id), c.unit_price_cents]));
  // One editor model per group, not per group per channel.
  const groupModel = new Map(groups.map((g) => [g.id, toPriceGroupViewProps({ ...snapshot, groupId: g.id })]));
  return (
    <PriceGroupsView
      model={model}
      backHref="/catalog"
      createAction={<GroupForm model={toPriceGroupViewProps(snapshot)} />}
      renderGroup={(row) => <GroupForm groupId={row.id} model={groupModel.get(row.id)!} />}
      renderCell={(channel, row, col, label) => {
        const formatId = row.formatIds[col];
        if (!formatId) return null;
        const value = cents.get(cellKey(channel.id, row.id, formatId)) ?? null;
        return <PriceCellForm key={value ?? "empty"} saleChannelId={channel.id} priceGroupId={row.id} formatId={formatId} cents={value} label={label} groupName={row.name} formatName={model.formats[col]!} channelName={channel.name} />;
      }}
    />
  );
}
