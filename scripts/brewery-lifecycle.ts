#!/usr/bin/env node
// scripts/brewery-lifecycle.ts — admin-run brewery closure and export (#766).
//   bun scripts/brewery-lifecycle.ts export <breweryId> <outDir>
//   bun scripts/brewery-lifecycle.ts close  <breweryId>
// Both need DATABASE_URL (a direct Postgres URL with service privileges).
// export: one CSV per public table that has a brewery_id, minus integration and
//   chat plumbing (credentials, delivery state), filtered to that brewery.
// close: public.close_brewery: ends every staff and buyer login's access and
//   stamps closed_at. Disconnect QuickBooks, Square and Slack in Settings first.
//   Records stay for 3 years from closed_at; removing them after that is manual.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client, types } from "pg";
import { csvCell } from "@/lib/mgr/destination-state-export";

// Keep `date` columns (brewed_on, packaged_on, ...) as the plain YYYY-MM-DD Postgres stored;
// node-pg would otherwise build a local-midnight Date that shifts across timezones.
types.setTypeParser(types.builtins.DATE, v => v);

// ponytail: plumbing tables are named here; a new integration table defaults to exported.
const PLUMBING = new Set(["brewery_counters", "chat_action_intents", "chat_callback_receipts", "chat_installations",
  "chat_user_links", "notification_deliveries", "notification_destinations", "notification_occurrences",
  "notification_preferences", "pos_connections", "qbo_connections", "qbo_pushes"]);

const cell = (v: unknown) => v === null || v === undefined ? '""'
  : csvCell(v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : typeof v === "number" ? v : String(v));

function writeCsv(dir: string, table: string, header: string[], rows: Record<string, unknown>[]) {
  writeFileSync(join(dir, `${table}.csv`), [header.map(h => csvCell(h)), ...rows.map(r => header.map(h => cell(r[h])))]
    .map(line => line.join(",")).join("\r\n") + "\r\n");
}

async function main() {
  const [command, breweryId, outDir] = process.argv.slice(2);
  if (!/^[0-9a-f-]{36}$/i.test(breweryId ?? "") || (command !== "close" && !(command === "export" && outDir))) {
    throw new Error("usage: brewery-lifecycle.ts export <breweryId> <outDir> | close <breweryId>");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    if (command === "close") {
      const { rows } = await db.query("select public.close_brewery($1) as result", [breweryId]);
      const result = rows[0].result as { closed_at: string };
      const keepUntil = new Date(result.closed_at); keepUntil.setFullYear(keepUntil.getFullYear() + 3);
      console.log(JSON.stringify({ ...result, keep_records_until: keepUntil.toISOString().slice(0, 10) }));
      return;
    }
    mkdirSync(outDir, { recursive: true });
    // One read-only snapshot, so tables written while the export runs stay consistent.
    await db.query("begin isolation level repeatable read read only");
    const { rows: tables } = await db.query<{ table: string }>(`select c.relname as table from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'brewery_id' and not a.attisdropped
      where c.relkind = 'r' order by 1`);
    const brewery = await db.query("select * from public.breweries where id = $1", [breweryId]);
    if (brewery.rowCount !== 1) throw new Error("brewery not found");
    writeCsv(outDir, "breweries", brewery.fields.map(f => f.name), brewery.rows);
    const exported = [];
    for (const { table } of tables.filter(t => !PLUMBING.has(t.table))) {
      const { rows, fields } = await db.query(`select * from public."${table.replaceAll('"', '""')}" where brewery_id = $1`, [breweryId]);
      writeCsv(outDir, table, fields.map(f => f.name), rows);
      exported.push(`${table}: ${rows.length}`);
    }
    await db.query("commit");
    console.log(exported.join("\n"));
  } finally {
    await db.end();
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
