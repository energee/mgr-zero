import type { ImportViewModel } from "@/components/mgr/views/import";
import { validateImportRow } from "@/lib/import-csv";

const channel = "00000000-0000-4000-8000-000000000001";
const lookups = { channels: [{ id: channel, name: "Wholesale" }], customers: [], formats: [], groups: [], skus: [], locations: [], bins: [] };
const rows = [
  { name: "Ridgeline + Main", type: "retailer", state: "PA", saleChannelId: channel },
  { name: "Al’s Bar", type: "retailer", state: "PA", saleChannelId: "" },
  { name: "Teresa’s", type: "retailer", state: "PA", saleChannelId: channel },
];
export const importPreview: ImportViewModel = { kind: "customers", step: 2, mapping: {}, rows, validation: rows.map(row => validateImportRow("customers", row, lookups)), lookups };
