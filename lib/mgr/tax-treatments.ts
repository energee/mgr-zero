// lib/mgr/tax-treatments.ts — the tax treatments a sale channel may carry,
// shared by the settings page, the client forms and the view adapters. A plain
// module in lib/mgr so nothing under lib/ has to reach into a route to read it.
// Mirrors the enum on upsert_sale_channel in lib/commands/catalog.ts. Operators
// never read the raw enum: sentenceCase in lib/mgr/labels.ts humanizes it.

export const TAX_TREATMENTS = ["taxable", "export", "vessel_supplies", "research", "transfer_in_bond"] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];
