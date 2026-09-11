// lib/mgr/fixtures/catalog.ts — list_brands / list_skus / list_formats /
// list_price_groups snapshots for the Catalog family inventory frames.
// Identities from demo.ts SKU_* names. Views own no sample data.
import { SKU_HAZY, SKU_PILS, SKU_STOUT } from "./demo";
import type { BrandSnapshot } from "@/lib/mgr/brand-view";
import type { CatalogSnapshot } from "@/lib/mgr/catalog-view";
import type { FormatSnapshot } from "@/lib/mgr/format-view";
import type { FormatsSnapshot } from "@/lib/mgr/formats-view";
import type { PackageBomSnapshot } from "@/lib/mgr/package-bom-view";
import type { SkuListSnapshot } from "@/lib/mgr/sku-list-view";
import type { SkuSnapshot } from "@/lib/mgr/sku-view";

const HAZY = SKU_HAZY.name.split(" · ")[0];
const PILS = SKU_PILS.name.split(" · ")[0];
const STOUT = SKU_STOUT.name.split(" · ")[0];

const BRAND_HAZY = "00000000-0000-4000-8000-0000000000b1";
const BRAND_PILS = "00000000-0000-4000-8000-0000000000b2";
const BRAND_STOUT = "00000000-0000-4000-8000-0000000000b3";
const FMT_CAN = "00000000-0000-4000-8000-0000000000f1";
const FMT_FOUR = "00000000-0000-4000-8000-0000000000f2";
const FMT_CASE = "00000000-0000-4000-8000-0000000000f3";
const FMT_HALF = "00000000-0000-4000-8000-0000000000f4";
const FMT_PINT = "00000000-0000-4000-8000-0000000000f5";
const FMT_SIXTH = "00000000-0000-4000-8000-0000000000f6";
const SKU_HAZY_SIXTH = "00000000-0000-4000-8000-0000000000a4";
const SKU_HAZY_CASE = "00000000-0000-4000-8000-0000000000a5";
const SKU_PILS_BOTTLE = "00000000-0000-4000-8000-0000000000a6";
const PG_3 = "00000000-0000-4000-8000-0000000000p3";

const priceGroups = Array.from({ length: 8 }, (_, i) => ({
  id: i === 2 ? PG_3 : `00000000-0000-4000-8000-0000000000p${i + 1}`,
  name: String(i + 1),
}));

const hazySkus = [
  { id: SKU_HAZY.sku_id, name: SKU_HAZY.name, format_id: FMT_HALF, active: true },
  { id: SKU_HAZY_SIXTH, name: `${HAZY} · ⅙ bbl keg`, format_id: FMT_SIXTH, active: true },
  { id: SKU_HAZY_CASE, name: `${HAZY} · case · 24×16 oz`, format_id: FMT_CASE, active: true },
];

const packagedFormats = [
  { id: FMT_HALF, name: "½ bbl keg" },
  { id: FMT_SIXTH, name: "⅙ bbl keg" },
  { id: FMT_CASE, name: "case · 24×16 oz" },
];

/** More → Catalog: three brands, 8 price groups, 3 channels, 3 water profiles. */
export const catalogBrands: CatalogSnapshot = {
  brands: [
    {
      id: BRAND_HAZY,
      name: HAZY,
      abv: 6.8,
      styles: { name: "IPA" },
      skus: hazySkus,
    },
    {
      id: BRAND_PILS,
      name: PILS,
      abv: 4.9,
      styles: { name: "Lager" },
      skus: [
        { id: SKU_PILS.sku_id, name: SKU_PILS.name, format_id: FMT_CASE, active: true },
        { id: SKU_PILS_BOTTLE, name: `${PILS} · 12 oz bottle`, format_id: FMT_CAN, active: true },
      ],
    },
    {
      id: BRAND_STOUT,
      name: STOUT,
      abv: 7.2,
      styles: { name: "Stout" },
      skus: [{ id: SKU_STOUT.sku_id, name: SKU_STOUT.name, format_id: FMT_SIXTH, active: true }],
    },
  ],
  priceGroups,
  channels: [
    { id: "ch-wholesale", name: "Wholesale" },
    { id: "ch-taproom", name: "Taproom" },
    { id: "ch-dtc", name: "DTC" },
  ],
  waterProfileCount: 3,
};

/** Hazy IPA brand sheet: Core, price group 3, 3 active packages. */
export const brandHazy: BrandSnapshot = {
  brand: {
    id: BRAND_HAZY,
    name: HAZY,
    abv: 6.8,
    description: "Juicy, soft, Citra-forward",
    category: "Core",
    hops: "Citra, Mosaic",
    price_group_id: PG_3,
    styles: { name: HAZY },
    skus: hazySkus,
  },
  styles: [HAZY, "IPA", PILS, "Add “Cold IPA”"],
  priceGroups,
};

/** Hazy IPA · ½ bbl keg SKU sheet. UPC is the Standard group case code. */
export const skuHazyHalf: SkuSnapshot = {
  sku: {
    id: SKU_HAZY.sku_id,
    name: SKU_HAZY.name,
    upc: "00810123450127",
    active: true,
    format_id: FMT_HALF,
    formats: { name: "½ bbl keg" },
  },
  formats: packagedFormats,
};

/** Hazy IPA SKUs: ½ bbl, ⅙ bbl, case. */
export const skuListHazy: SkuListSnapshot = {
  brand: { id: BRAND_HAZY, name: HAZY },
  skus: [
    {
      id: SKU_HAZY.sku_id,
      name: SKU_HAZY.name,
      active: true,
      format_id: FMT_HALF,
      formats: { name: "½ bbl keg", bbl_per_unit: "0.50000000" },
    },
    {
      id: SKU_HAZY_SIXTH,
      name: `${HAZY} · ⅙ bbl keg`,
      active: true,
      format_id: FMT_SIXTH,
      formats: { name: "⅙ bbl keg", bbl_per_unit: "0.16666667" },
    },
    {
      id: SKU_HAZY_CASE,
      name: `${HAZY} · case · 24×16 oz`,
      active: true,
      format_id: FMT_CASE,
      formats: { name: "case · 24×16 oz", bbl_per_unit: "0.09677419" },
    },
  ],
};

const fmt = (
  id: string,
  name: string,
  basis: "packaged" | "poured",
  bbl_per_unit: string | null,
  package_type: string | null = null,
) => ({ id, name, basis, package_type, bbl_per_unit });

/** Settings → Formats table: can through pint, volumes from formatVolume. */
export const formatsInventory: FormatsSnapshot = {
  formats: [
    fmt(FMT_CAN, "16 oz can", "packaged", "0.00403226", "can"),
    fmt(FMT_FOUR, "four-pack", "packaged", "0.01612903", "can"),
    fmt(FMT_CASE, "case · 24×16oz", "packaged", "0.09677419", "can"),
    fmt(FMT_HALF, "½ bbl keg", "packaged", "0.50000000", "keg"),
    { ...fmt(FMT_PINT, "Pint", "poured", null), brands: { name: HAZY }, ounces: 16 },
  ],
  components: [
    { parent_format_id: FMT_FOUR, child_format_id: FMT_CAN, qty: 4 },
    { parent_format_id: FMT_CASE, child_format_id: FMT_FOUR, qty: 6 },
  ],
};

/** Atomic 16 oz can with can-body / can-end BOM. */
export const formatCan: FormatSnapshot = {
  format: {
    id: FMT_CAN,
    name: "16 oz can",
    basis: "packaged",
    package_type: "can",
    bbl_per_unit: "0.00403226",
  },
  bom: [
    { material: "Can body", qty: 1, onBreak: "consumed" },
    { material: "Can end", qty: 1, onBreak: "consumed" },
  ],
};

/** Case packaging bill: 24 cans, 24 ends, 1 tray. */
export const packageBomCase: PackageBomSnapshot = {
  format: { id: FMT_CASE, name: "case · 24×16 oz" },
  lines: [
    { id: "bom-can", material: { id: "mat-can", name: "16 oz can" }, qty_per_unit: 24, on_break: "consumed" },
    { id: "bom-end", material: { id: "mat-end", name: "Can end" }, qty_per_unit: 24, on_break: "consumed" },
    { id: "bom-tray", material: { id: "mat-tray", name: "Case tray" }, qty_per_unit: 1, on_break: "return_to_stock" },
  ],
};
