// app/(app)/pricing/page.tsx — Price groups: the price grid, one table per sale
// channel, price groups down and formats across. Reads list_sale_channels,
// list_price_groups, list_formats and list_channel_prices (the whole grid in one
// read); every cell edits through set_channel_price / clear_channel_price
// (PriceCellForm, keyed on its value so a save or clear remounts it). Groups are
// added, renamed and removed here too (GroupForm). With no groups there is no
// grid to draw, and with no sale channels the page says so. Failures throw to
// the (app) error boundary.
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
  const [channels, groups, formats, cells] = (await Promise.all([
    runCommand("list_sale_channels", {}, ctx),
    runCommand("list_price_groups", {}, ctx),
    runCommand("list_formats", {}, ctx),
    runCommand("list_channel_prices", {}, ctx),
  ])) as [Row[], PriceGroupEditData[], Row[], Cell[]];
  const byKey = new Map(cells.map((c) => [`${c.sale_channel_id}|${c.price_group_id}|${c.format_id}`, c]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Price groups</h1>
        <GroupForm defaultPosition={groups.length + 1} />
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Add a price group, then put each brand on one from Catalog.</p>
      )}

      {channels.length === 0 && (
        <p className="text-sm text-muted-foreground">No sale channels yet.</p>
      )}

      {groups.length > 0 && channels.map((channel) => (
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
                      <GroupForm group={group} />
                    </td>
                    {formats.map((f) => {
                      const cell = byKey.get(`${channel.id}|${group.id}|${f.id}`);
                      return (
                        <td key={f.id} className="py-1 pr-4">
                          <PriceCellForm
                            key={cell?.unit_price_cents ?? "empty"}
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
