// app/(app)/pricing/page.tsx — Price groups: the price grid, one table per sale
// channel, price groups down and formats across. Reads list_sale_channels,
// list_price_groups, list_formats and list_channel_prices; every cell edits
// through set_channel_price / clear_channel_price (PriceCellForm). Groups are
// added, renamed and removed here too (GroupForm). Failures throw to the (app)
// error boundary.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { money } from "@/lib/mgr/money";
import { PriceCellForm } from "./price-cell-form";
import { GroupForm, type PriceGroupEditData } from "./group-form";

type Row = { id: string; name: string };
type Cell = { sale_channel_id: string; price_group_id: string; format_id: string; unit_price_cents: number };

export default async function PricingPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [channels, groups, formats] = (await Promise.all([
    runCommand("list_sale_channels", {}, ctx),
    runCommand("list_price_groups", {}, ctx),
    runCommand("list_formats", {}, ctx),
  ])) as [Row[], PriceGroupEditData[], Row[]];
  const cells = (
    await Promise.all(channels.map((c) => runCommand("list_channel_prices", { saleChannelId: c.id }, ctx)))
  ).flat() as Cell[];
  const at = (channelId: string, groupId: string, formatId: string) =>
    cells.find((c) => c.sale_channel_id === channelId && c.price_group_id === groupId && c.format_id === formatId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Price groups</h1>
        <GroupForm nextPosition={groups.length + 1} />
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Add a price group, then put each brand on one from Catalog.</p>
      )}

      {channels.map((channel) => (
        <section key={channel.id} className="flex flex-col gap-2">
          <h2 className="font-medium">{channel.name}</h2>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4 font-normal">Group</th>
                  {formats.map((f) => (
                    <th key={f.id} className="py-1 pr-4 font-normal">{f.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="border-t">
                    <td className="py-1 pr-4">
                      <GroupForm group={group} nextPosition={group.position} />
                    </td>
                    {formats.map((f) => {
                      const cell = at(channel.id, group.id, f.id);
                      return (
                        <td key={f.id} className="py-1 pr-4">
                          <PriceCellForm
                            saleChannelId={channel.id}
                            priceGroupId={group.id}
                            formatId={f.id}
                            cents={cell?.unit_price_cents ?? null}
                            label={cell ? money(cell.unit_price_cents) : "—"}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
