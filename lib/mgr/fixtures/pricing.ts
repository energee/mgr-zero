// lib/mgr/fixtures/pricing.ts — list_sale_channels, list_price_groups,
// list_formats and list_channel_prices snapshot for the Price groups grid.
// Views own no sample data. Hazy wholesale ½ bbl and Pils case are cents.
import type { PriceGroupSnapshot } from "@/lib/mgr/price-group-view";
import type { PriceGroupsSnapshot } from "@/lib/mgr/price-groups-view";

const CH_WHOLESALE = "00000000-0000-4000-8000-0000000000c1";
const CH_TAPROOM = "00000000-0000-4000-8000-0000000000c2";
const PG1 = "00000000-0000-4000-8000-0000000000g1";
const PG2 = "00000000-0000-4000-8000-0000000000g2";
const PG3 = "00000000-0000-4000-8000-0000000000g3";
const FMT_HALF = "00000000-0000-4000-8000-0000000000f1";
const FMT_SIXTEL = "00000000-0000-4000-8000-0000000000f2";
const FMT_CASE = "00000000-0000-4000-8000-0000000000f3";
const FMT_PINT = "00000000-0000-4000-8000-0000000000f4";
const FMT_CROWLER = "00000000-0000-4000-8000-0000000000f5";

/** Hazy IPA wholesale ½ bbl. Inventory drawing: $150.00. */
const HAZY_HALF_CENTS = 15000;
/** Pils wholesale case. Inventory drawing: $38.00. */
const PILS_CASE_CENTS = 3800;

const cell = (
  sale_channel_id: string,
  price_group_id: string,
  format_id: string,
  unit_price_cents: number,
) => ({ sale_channel_id, price_group_id, format_id, unit_price_cents });

/** Catalog → Price groups: Wholesale packaged + Taproom poured. */
export const pricingGrid: PriceGroupsSnapshot = {
  channels: [
    { id: CH_WHOLESALE, name: "Wholesale" },
    { id: CH_TAPROOM, name: "Taproom" },
  ],
  groups: [
    { id: PG1, name: "1", position: 1, cost_ceiling_cents: null },
    { id: PG2, name: "2", position: 2, cost_ceiling_cents: 6500 },
    { id: PG3, name: "3", position: 3, cost_ceiling_cents: null },
  ],
  formats: [
    { id: FMT_HALF, name: "½ bbl keg" },
    { id: FMT_SIXTEL, name: "sixtel" },
    { id: FMT_CASE, name: "case · 24×16oz" },
    { id: FMT_PINT, name: "pint" },
    { id: FMT_CROWLER, name: "crowler" },
  ],
  cells: [
    cell(CH_WHOLESALE, PG1, FMT_HALF, 13200),
    cell(CH_WHOLESALE, PG1, FMT_SIXTEL, 5300),
    cell(CH_WHOLESALE, PG1, FMT_CASE, 4600),
    cell(CH_WHOLESALE, PG2, FMT_HALF, HAZY_HALF_CENTS),
    cell(CH_WHOLESALE, PG2, FMT_SIXTEL, 9500),
    cell(CH_WHOLESALE, PG2, FMT_CASE, PILS_CASE_CENTS),
    cell(CH_WHOLESALE, PG3, FMT_HALF, 24000),
    cell(CH_WHOLESALE, PG3, FMT_SIXTEL, 14000),
    cell(CH_TAPROOM, PG1, FMT_PINT, 700),
    cell(CH_TAPROOM, PG1, FMT_CROWLER, 1400),
    cell(CH_TAPROOM, PG2, FMT_PINT, 800),
    cell(CH_TAPROOM, PG2, FMT_CROWLER, 1600),
    cell(CH_TAPROOM, PG3, FMT_PINT, 1100),
  ],
};

/** Price group 2: ceiling $65.00/bbl, previous group none, Hazy cell featured. */
export const priceGroupTwo: PriceGroupSnapshot = { ...pricingGrid, groupId: PG2 };
