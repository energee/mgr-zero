// tests/capped-db.ts — a stub Supabase transport for pure paging tests: it
// filters, orders and slices in-memory tables, and caps each response at 1000
// rows the way PostgREST's max_rows does. A later page (start > 0) reverses the
// rows before its stable sort, so rows tied on every order column come back in a
// different order than on the first page, as Postgres may: only an explicit
// unique order (such as a trailing `id`) pages without overlap.
import type { Ctx } from "@/lib/commands/registry";

export type Row = Record<string, unknown>;
/** One page read: the table and the columns it was ordered by, in order. */
export type PageRead = { table: string; order: string[] };
/** Make the read of `table` starting at `start` fail, or (`changed`) report one extra row in its count. */
export type PageFailure = { table: string; start: number; changed?: boolean };

export function cappedDb(tables: Record<string, Row[]>, options: { failure?: PageFailure; reads?: PageRead[] } = {}): Ctx["db"] {
  const { failure, reads } = options;
  const db = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const order: { column: string; ascending: boolean }[] = [];
      let start = 0, end = Infinity, counted = false;
      const query = {
        select(_columns: string, options?: { count?: string }) { counted = options?.count === "exact"; return query; },
        eq(column: string, value: unknown) { rows = rows.filter(row => row[column] === value); return query; },
        in(column: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[column])); return query; },
        is(column: string, value: null) { rows = rows.filter(row => row[column] === value); return query; },
        not(column: string, _op: "is", value: null) { rows = rows.filter(row => row[column] !== value); return query; },
        order(column: string, options?: { ascending?: boolean; referencedTable?: string }) {
          if (!options?.referencedTable) order.push({ column, ascending: options?.ascending ?? true });
          return query;
        },
        limit() { return query; },
        range(from: number, to: number) { start = from; end = to; return query; },
        then(resolve: (result: { data: Row[] | null; error: { message: string; code: string } | null; count: number | null }) => unknown) {
          reads?.push({ table, order: order.map(o => o.column) });
          if (start > 0) rows.reverse();
          rows.sort((a, b) => {
            for (const { column, ascending } of order) {
              const comparison = String(a[column]).localeCompare(String(b[column]));
              if (comparison) return ascending ? comparison : -comparison;
            }
            return 0;
          });
          const fails = failure?.table === table && failure.start === start;
          return Promise.resolve(resolve({
            data: fails && !failure.changed ? null : rows.slice(start, Math.min(end + 1, start + 1000)),
            error: fails && !failure.changed ? { message: "Read denied", code: "42501" } : null,
            count: counted ? rows.length + (fails && failure.changed ? 1 : 0) : null,
          }));
        },
      };
      return query;
    },
  };
  return db as unknown as Ctx["db"];
}
