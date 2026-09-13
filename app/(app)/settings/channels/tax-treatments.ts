// app/(app)/settings/channels/tax-treatments.ts — the tax treatments a sale
// channel may carry, shared by the server page and the client form (a plain
// module, so the server may call the label helper). Mirrors the enum on
// upsert_sale_channel in lib/commands/catalog.ts.
import { sentenceCase } from "@/lib/mgr/labels";

export const TAX_TREATMENTS = ["taxable", "export", "vessel_supplies", "research", "transfer_in_bond"] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

/** "vessel_supplies" → "Vessel supplies"; operators never read the raw enum. */
export const treatmentLabel = sentenceCase;
