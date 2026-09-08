// app/(app)/pricing/page.tsx — Price groups (screen record): the price grid,
// one table per sale channel, price groups down and formats across. Reads
// list_sale_channels, list_price_groups, list_formats and list_channel_prices
// (the whole grid in one read); every cell edits through set_channel_price /
// clear_channel_price (PriceCellForm, keyed on its value so a save or clear
// remounts it). Groups are added, renamed and removed here too (GroupForm).
import { E } from "@/components/mgr/e";
import { PriceGroupsView } from "@/components/mgr/views/price-groups";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toPriceGroupsViewProps } from "@/lib/mgr/price-groups-view";
import { money } from "@/lib/mgr/money";
import "@/lib/commands/all";
import { PriceCellForm } from "./price-cell-form";
import { GroupForm, type PriceGroupEditData } from "./group-form";

type Row = { id: string; name: string };
type Cell = { sale_channel_id: string; price_group_id: string; format_id: string; unit_price_cents: number };

export default async function PricingPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [channels, groups, formats, cells] = (await Promise.all([
    runCommand("list_sale_channels", {}, ctx), runCommand("list_price_groups", {}, ctx), runCommand("list_formats", {}, ctx), runCommand("list_channel_prices", {}, ctx),
  ])) as [Row[], PriceGroupEditData[], Row[], Cell[]];
  const byKey = new Map(cells.map((c) => [`${c.sale_channel_id}|${c.price_group_id}|${c.format_id}`, c]));
  return (
    <PriceGroupsView
      model={toPriceGroupsViewProps({ channels, groups, formats, cells })}
      backHref="/catalog"
      createAction={<GroupForm defaultPosition={groups.length + 1} />}
      tables={
        <>
          {groups.length === 0 && E.blank("Add a price group, then put each brand on one from Catalog.")}
          {channels.length === 0 && E.blank("No sale channels yet")}
          {groups.length > 0 && channels.map((channel) => (
            <div key={channel.id}>
              {E.ttl(channel.name)}
              <div className="min-w-0 overflow-x-auto">
                {E.tbl(["Group", ...formats.map((f) => f.name)], groups.map((group) => [
                  <GroupForm key={group.id} group={group} />,
                  ...formats.map((f) => {
                    const cell = byKey.get(`${channel.id}|${group.id}|${f.id}`);
                    return <PriceCellForm key={cell?.unit_price_cents ?? "empty"} saleChannelId={channel.id} priceGroupId={group.id} formatId={f.id} cents={cell?.unit_price_cents ?? null} label={cell ? money(cell.unit_price_cents) : "not priced"} />;
                  }),
                ]))}
              </div>
            </div>
          ))}
        </>
      }
    />
  );
}
