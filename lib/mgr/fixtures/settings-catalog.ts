// lib/mgr/fixtures/settings-catalog.ts — list_sale_channels / get_gravity_unit
// snapshots for the Sale channels, Channel, and Units inventory frames.
// Views own no sample data.
import type { ChannelSnapshot } from "@/lib/mgr/channel-view";
import type { SaleChannelsSnapshot } from "@/lib/mgr/sale-channels-view";
import type { UnitsSnapshot } from "@/lib/mgr/units-view";

const CH_WHOLESALE = "00000000-0000-4000-8000-0000000000h1";
const CH_TAPROOM = "00000000-0000-4000-8000-0000000000h2";
const CH_DTC = "00000000-0000-4000-8000-0000000000h3";
const CH_EXPORT = "00000000-0000-4000-8000-0000000000h4";

/** Settings → Sale channels: four seeded names with inventory movement counts. */
export const saleChannelsList: SaleChannelsSnapshot = {
  channels: [
    { id: CH_WHOLESALE, name: "Wholesale", tax_treatment: "taxable", movements: 118 },
    { id: CH_TAPROOM, name: "Taproom", tax_treatment: "taxable", movements: 402 },
    { id: CH_DTC, name: "DTC", tax_treatment: "taxable", movements: 34 },
    { id: CH_EXPORT, name: "Export", tax_treatment: "export", movements: 6 },
  ],
};

/** Export channel sheet. */
export const channelExport: ChannelSnapshot = {
  id: CH_EXPORT,
  name: "Export",
  tax_treatment: "export",
};

/** Brewery default Plato, no personal override — inventory Units. */
export const unitsPlato: UnitsSnapshot = {
  brewery: "plato",
  mine: null,
  effective: "plato",
};
