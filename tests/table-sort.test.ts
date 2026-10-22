// tests/table-sort.test.ts — how a table cell becomes a sort value, how two
// values compare, and how a table's last sort is saved per browser.
import { createElement, Fragment } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cellSortValue, compareSortValues, readSavedSort, saveSort, sortStorageKey } from "../lib/mgr/table-sort";

const sorted = (values: (string | number)[]) => [...values].sort(compareSortValues);

describe("cellSortValue", () => {
  it("keeps a string or number as is", () => {
    expect(cellSortValue("Alpha")).toBe("Alpha");
    expect(cellSortValue(3)).toBe(3);
  });

  it("reads an empty cell as null", () => {
    for (const cell of [null, undefined, false, true, "", "—", createElement("span", null, "—")]) expect(cellSortValue(cell)).toBeNull();
  });

  it("reads a host element or fragment by its text children", () => {
    expect(cellSortValue(createElement("em", null, "Rich ", createElement("b", null, "text")))).toBe("Rich text");
    const due = createElement(Fragment, null, createElement("span", null, "Overdue"), " ", "Sep 12, 2026");
    expect(cellSortValue(due)).toBe("Overdue Sep 12, 2026");
    expect(cellSortValue(["a", 1])).toBe("a1");
  });

  it("reads a function component as null: its text is not in the tree", () => {
    const Available = () => createElement("span", null, "12");
    expect(cellSortValue(createElement(Available))).toBeNull();
  });
});

describe("compareSortValues", () => {
  it("orders printed dates by time across months and years", () => {
    expect(sorted(["Jan 3, 2027", "Sep 12, 2026", "Oct 1, 2026"])).toEqual(["Sep 12, 2026", "Oct 1, 2026", "Jan 3, 2027"]);
  });

  it("orders a cell ending in a date by that date", () => {
    const due = cellSortValue(createElement(Fragment, null, createElement("span", null, "Overdue"), " ", "Sep 12, 2026")) as string;
    expect(sorted(["Jan 3, 2027", due])).toEqual([due, "Jan 3, 2027"]);
  });

  it("orders figures by number", () => {
    expect(compareSortValues("$990.00", "$1,040.00")).toBeLessThan(0);
    expect(compareSortValues("−$25.00", "$0.00")).toBeLessThan(0);
    expect(compareSortValues("-3", "2")).toBeLessThan(0);
    expect(compareSortValues("12.5%", "100%")).toBeLessThan(0);
    expect(compareSortValues(9, 12)).toBeLessThan(0);
  });

  it("orders other text naturally, ignoring case", () => {
    expect(compareSortValues("B-9", "B-12")).toBeLessThan(0);
    expect(compareSortValues("alpha", "Beta")).toBeLessThan(0);
    expect(compareSortValues("Alpha", "alpha")).toBe(0);
  });

  it("compares a number with text as text", () => {
    expect(compareSortValues(2, "B")).toBeLessThan(0);
  });
});

describe("saved sort", () => {
  const key = sortStorageKey("/orders", ["Order", "Customer", "Total"]);
  const memory = () => {
    const items = new Map<string, string>();
    return {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    };
  };

  afterEach(() => vi.unstubAllGlobals());

  it("keys a table by its page and header texts", () => {
    expect(key).toBe("mgr-sort:/orders:Order|Customer|Total");
  });

  it("reads back what it saved, and forgets an empty sort", () => {
    vi.stubGlobal("localStorage", memory());
    saveSort(key, [{ id: "2", desc: true }]);
    expect(readSavedSort(key)).toEqual([{ id: "2", desc: true }]);
    saveSort(key, []);
    expect(localStorage.getItem(key)).toBeNull();
    expect(readSavedSort(key)).toEqual([]);
  });

  it("ignores a malformed saved value", () => {
    const store = memory();
    vi.stubGlobal("localStorage", store);
    for (const bad of ["not json", "{}", '[{"id":2,"desc":true}]', '[{"id":"2"}]', "[null]"]) {
      store.setItem(key, bad);
      expect(readSavedSort(key)).toEqual([]);
    }
  });

  it("treats blocked storage as no saved sort", () => {
    const fail = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: fail, setItem: fail, removeItem: fail });
    expect(readSavedSort(key)).toEqual([]);
    expect(() => saveSort(key, [{ id: "0", desc: false }])).not.toThrow();
    expect(() => saveSort(key, [])).not.toThrow();
  });
});
