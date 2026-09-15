// app/(app)/pricing/page.tsx — Price groups (screen record): the price grid,
// one table per sale channel, price groups down and formats across. Reads
// list_sale_channels, list_price_groups, list_formats and list_channel_prices
// (the whole grid in one read); every cell edits through set_channel_price /
// clear_channel_price (PriceCellForm, keyed on its value so a save or clear
// remounts it). Groups are added, renamed and removed here too (GroupForm,
// which draws the same PriceGroupView for create and edit). One blank state
// at a time: no groups first, then no channels.
import { PriceGroupsView } from "@/components/mgr/views/price-groups";
import { toPriceGroupsViewProps } from "@/lib/mgr/price-groups-view";
import { toNewPriceGroupViewProps, toPriceGroupViewProps } from "@/lib/mgr/price-group-view";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { money } from "@/lib/mgr/money";
import { PriceCellForm } from "./price-cell-form";
import { GroupForm, type PriceGroupEditData } from "./group-form";

type Row = { id: string; name: string; brands?: { name: string } | null };
type Cell = { sale_channel_id: string; price_group_id: string; format_id: string; unit_price_cents: number };

export default async function PricingPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [channels, groups, formats, cells] = (await Promise.all([
    runCommand("list_sale_channels", {}, ctx), runCommand("list_price_groups", {}, ctx), runCommand("list_formats", {}, ctx), runCommand("list_channel_prices", {}, ctx),
  ])) as [Row[], PriceGroupEditData[], Row[], Cell[]];
  const byKey = new Map(cells.map((c) => [`${c.sale_channel_id}|${c.price_group_id}|${c.format_id}`, c]));
  const snapshot = { channels, groups, formats, cells };
  const formatName = (f: Row) => f.brands ? `${f.brands.name} · ${f.name}` : f.name;
  return (
    <PriceGroupsView
      model={toPriceGroupsViewProps(snapshot)}
      backHref="/catalog"
      createAction={<GroupForm model={toNewPriceGroupViewProps(snapshot)} />}
      tables={groups.length === 0 ? E.blank("Add a price group, then put each brand on one from Catalog.")
        : channels.length === 0 ? E.blank("No sale channels yet")
        : channels.map((channel) => (
        <div key={channel.id}>
          {E.ttl(channel.name)}
          <div className="min-w-0 overflow-x-auto">
            {E.tbl(["Group", ...formats.map(formatName)], groups.map((group) => [
              <GroupForm key={group.id} group={group} model={toPriceGroupViewProps({ ...snapshot, groupId: group.id })} />,
              ...formats.map((f) => {
                const cell = byKey.get(`${channel.id}|${group.id}|${f.id}`);
                return <PriceCellForm key={cell?.unit_price_cents ?? "empty"} saleChannelId={channel.id} priceGroupId={group.id} formatId={f.id} cents={cell?.unit_price_cents ?? null} label={cell ? money(cell.unit_price_cents) : "not priced"} groupName={group.name} formatName={formatName(f)} channelName={channel.name} />;
              }),
            ]))}
          </div>
        </div>
      ))}
    />
  );
}
