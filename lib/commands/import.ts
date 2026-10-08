import { z } from "zod";
import { defineCommand, unwrap } from "./registry";
import { IMPORT_KINDS, IMPORT_ROW_CAP, importRowKey, validateImportRow, type ImportOutcome } from "@/lib/import-csv";

// Concurrent row RPCs per import. ponytail: fixed; raise it if a 5000-row import is still slow.
const IMPORT_CONCURRENCY = 8;
export { IMPORT_ROW_CAP } from "@/lib/import-csv";

defineCommand({
  name: "import_csv",
  description: "Import CSV customers, ship-tos, brand/SKUs, channel prices or opening balances; each row commits independently and the same requestId safely replays the exact batch",
  input: z.object({ kind: z.enum(IMPORT_KINDS), rows: z.array(z.record(z.string(), z.string())).min(1).max(IMPORT_ROW_CAP) }),
  roles: ["admin"],
  handler: async (ctx, input, execution) => {
    await unwrap(ctx.db.rpc("begin_csv_import", { p_brewery: ctx.breweryId, p_kind: input.kind, p_rows: input.rows, p_request_id: execution.requestId }));
    const outcomes = new Array<ImportOutcome>(input.rows.length);
    const importRow = async (row: number) => {
      const outcome = await unwrap(ctx.db.rpc("import_csv_row", { p_brewery: ctx.breweryId, p_request_id: execution.requestId, p_row_n: row })) as ImportOutcome;
      const errors = validateImportRow(input.kind, input.rows[row]);
      outcomes[row] = { ...outcome, row: row + 1, ...(outcome.status === "blocked" && errors.length ? { error: errors.join("; ") } : {}) };
    };
    // atomic-exempt: independent CSV rows; every dependent write within a row shares one RPC transaction.
    // Rows sharing importRowKey run in file order; distinct keys run IMPORT_CONCURRENCY at a time (#758).
    const queues = new Map<string, number[]>();
    input.rows.forEach((r, row) => {
      const key = importRowKey(input.kind, r);
      const queue = queues.get(key);
      if (queue) queue.push(row); else queues.set(key, [row]);
    });
    const pending = [...queues.values()];
    await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, pending.length) }, async () => {
      for (let queue = pending.shift(); queue; queue = pending.shift()) for (const row of queue) await importRow(row);
    }));
    return { committed: outcomes.filter(r => r.status === "committed").length, blocked: outcomes.filter(r => r.status === "blocked").length, outcomes };
  },
});
