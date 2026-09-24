// tests/list-paging.test.ts — the shared read helpers that keep list commands
// complete past PostgREST's max_rows (1000) and keep `.in()` URLs bounded
// (#469, #475). Pure: each page is a stubbed PostgREST response.
import { describe, it, expect } from "vitest";
import { completeRows, inChunks, CommandError } from "@/lib/commands/registry";

type Row = { id: string };
const rows = Array.from({ length: 2345 }, (_, n) => ({ id: String(n).padStart(5, "0") }));

describe("completeRows", () => {
  it("reads every page past the 1000-row cap", async () => {
    const starts: number[] = [];
    const got = await completeRows<Row>("Rows", start => {
      starts.push(start);
      return Promise.resolve({ data: rows.slice(start, start + 500), error: null, count: rows.length });
    });
    expect(got).toEqual(rows);
    expect(starts).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it("refuses a list whose count moves while loading", async () => {
    let call = 0;
    await expect(completeRows<Row>("Rows", start =>
      Promise.resolve({ data: rows.slice(start, start + 500), error: null, count: rows.length + call++ }),
    )).rejects.toBeInstanceOf(CommandError);
  });

  it("walks keyset pages past the 1000-row cap", async () => {
    const got = await completeRows<Row>("Rows", (_, after) => {
      const from = after ? rows.findIndex(r => r.id === after.id) + 1 : 0;
      return Promise.resolve({ data: rows.slice(from, from + 500), error: null, count: rows.length });
    }, row => row.id);
    expect(got).toEqual(rows);
  });
});

describe("inChunks", () => {
  it("sends at most 100 ids per read and concatenates the results", async () => {
    const ids = rows.slice(0, 250).map(r => r.id);
    const sizes: number[] = [];
    const got = await inChunks(ids, chunk => {
      sizes.push(chunk.length);
      return Promise.resolve(chunk.map(id => ({ id })));
    });
    expect(sizes).toEqual([100, 100, 50]);
    expect(got.map(r => r.id)).toEqual(ids);
  });

  it("makes no read for no ids", async () => {
    let calls = 0;
    await expect(inChunks([], async () => { calls++; return []; })).resolves.toEqual([]);
    expect(calls).toBe(0);
  });
});
