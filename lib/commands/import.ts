// lib/commands/import.ts — `import_csv` is registered but fails closed
// (audit P1.9). The name, role gate, and input contract stay so a direct
// /api/command post is a controlled CommandError rather than an unknown
// command; the handler never reaches the database. The per-kind importers
// that routed rows through the upsert_*/set_price RPCs live in git history
// (071a0a4) for when bulk import is re-approved.
import { z } from "zod";
import { defineCommand, CommandError } from "./registry";

export const IMPORT_ROW_CAP = 5000;

defineCommand({
  name: "import_csv",
  description: "Bulk CSV import — not available in this release",
  input: z.object({
    kind: z.enum(["customers", "ship_tos", "products_skus", "price_list_items", "opening_balances"]),
    rows: z.array(z.record(z.string(), z.string())).max(IMPORT_ROW_CAP, `at most ${IMPORT_ROW_CAP} rows per import batch`),
  }),
  roles: ["admin"],
  handler: async () => { throw new CommandError("CSV import is not available in this release"); },
});
