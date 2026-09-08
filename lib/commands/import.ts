import { z } from "zod";
import { defineCommand, unwrap } from "./registry";
import { IMPORT_KINDS, IMPORT_ROW_CAP, validateImportRow, type ImportOutcome } from "@/lib/import-csv";
export { IMPORT_ROW_CAP } from "@/lib/import-csv";

defineCommand({
  name: "import_csv",
  description: "Import CSV customers, ship-tos, brand/SKUs, channel prices or opening balances; each row commits independently and the same requestId safely replays the exact batch",
  input: z.object({ kind: z.enum(IMPORT_KINDS), rows: z.array(z.record(z.string(), z.string())).min(1).max(IMPORT_ROW_CAP) }),
  roles: ["admin"],
  handler: async (ctx, input, execution) => {
    await unwrap(ctx.db.rpc("begin_csv_import", { p_brewery: ctx.breweryId, p_kind: input.kind, p_rows: input.rows, p_request_id: execution.requestId }));
    const outcomes: ImportOutcome[] = [];
    // atomic-exempt: independent CSV rows; every dependent write within a row shares one RPC transaction.
    for (let row = 0; row < input.rows.length; row++) {
      const outcome = await unwrap(ctx.db.rpc("import_csv_row", { p_brewery: ctx.breweryId, p_request_id: execution.requestId, p_row_n: row })) as ImportOutcome;
      const errors = validateImportRow(input.kind, input.rows[row]);
      outcomes.push({ ...outcome, row: row + 1, ...(outcome.status === "blocked" && errors.length ? { error: errors.join("; ") } : {}) });
    }
    return { committed: outcomes.filter(r => r.status === "committed").length, blocked: outcomes.filter(r => r.status === "blocked").length, outcomes };
  },
});
