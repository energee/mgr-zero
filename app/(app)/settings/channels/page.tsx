// app/(app)/settings/channels/page.tsx — sale channels (schema §16.3): the
// named ways this brewery sells, each with the tax treatment its removals are
// recorded under. Reads through the command registry (list_sale_channels);
// add/edit go through upsert_sale_channel and removal through
// delete_sale_channel, both admin-only. Wholesale is pinned by name
// (private.ship_order_impl looks it up that way) so it can be neither renamed
// nor deleted, and a channel a movement or price list references cannot be
// deleted either — both refusals surface inline. Failures throw to the (app)
// error boundary.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { ChannelForm } from "./channel-form";
import { treatmentLabel } from "./tax-treatments";
import { DeleteChannelButton } from "./delete-channel-button";

type SaleChannel = { id: string; name: string; tax_treatment: string };

export default async function ChannelsPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const channels = (await runCommand("list_sale_channels", {}, ctx)) as SaleChannel[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sale channels</h1>
        <ChannelForm />
      </div>

      <p className="text-sm text-muted-foreground">
        A channel&apos;s tax treatment is the default for removals recorded on it. A
        customer may override it on their own record, and the resolved treatment is
        frozen onto each movement when it is recorded, so editing a channel later
        never restates a filed month.
      </p>

      {channels.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">Channel</th>
              <th className="py-1 font-normal">Tax treatment</th>
              <th className="py-1 font-normal" />
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-1 font-medium">{c.name}</td>
                <td className="py-1">{treatmentLabel(c.tax_treatment)}</td>
                <td className="py-1">
                  <div className="flex items-center justify-end gap-2">
                    <ChannelForm channel={{ id: c.id, name: c.name, taxTreatment: c.tax_treatment }} />
                    <DeleteChannelButton channelId={c.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">No sale channels yet.</p>
      )}
    </div>
  );
}
