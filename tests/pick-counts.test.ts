// Pick drafts retain observations across Short journeys without replacing server changes.
import { expect, it } from "vitest";
import { pickCountDraftKey, readPickCounts, savePickCounts, reconcileShortPick } from "@/lib/mgr/pick-counts";
import type { PickSnapshot } from "@/lib/mgr/pick-view";

const lines: PickSnapshot["lines"] = [
  { id: "short", sku_id: "sku-a", qty_ordered: 5, qty_picked: null, skus: null },
  { id: "other", sku_id: "sku-b", qty_ordered: 8, qty_picked: null, skus: null },
];
const key = "mgr:pick-counts:actor:brewery:order";
function storage() {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
}

it.each(["adjust_down", "keep_owed"])("keeps other unsaved counts after %s and repeated Short journeys", resolution => {
  const tab = storage();
  savePickCounts(tab, key, lines, { short: "2", other: "6.5" });
  reconcileShortPick(tab, key, "short");
  const updated = [{ ...lines[0], qty_ordered: resolution === "adjust_down" ? 2 : 5, qty_picked: 2 }, lines[1]];
  expect(readPickCounts(updated, tab.getItem(key))).toEqual({ short: "2", other: "6.5" });
  savePickCounts(tab, key, updated, { short: "1", other: "" });
  expect(readPickCounts(updated, tab.getItem(key))).toEqual({ short: "1", other: "" });
  reconcileShortPick(tab, key, "short");
  expect(readPickCounts([{ ...updated[0], qty_picked: 1 }, updated[1]], tab.getItem(key))).toEqual({ short: "1", other: "" });
});

it("reconciles changed and removed server lines without losing unchanged drafts", () => {
  const tab = storage();
  savePickCounts(tab, key, lines, { short: "2", other: "6" });
  expect(readPickCounts([{ ...lines[0], qty_picked: 3 }, lines[1]], tab.getItem(key))).toEqual({ short: "3", other: "6" });
  expect(readPickCounts([lines[1]], tab.getItem(key))).toEqual({ other: "6" });
});

it("invalidates unchanged counts after recovery-panel Short completion using its event", () => {
  const tab = storage();
  savePickCounts(tab, key, lines, { short: "1", other: "6" });
  expect(readPickCounts([{ ...lines[0], shortPickEventId: "new-event" }, lines[1]], tab.getItem(key))).toEqual({ short: "5", other: "6" });
});

it("removes a malformed draft after committed Short instead of throwing", () => {
  const tab = storage();
  tab.setItem(key, "not-json");
  expect(() => reconcileShortPick(tab, key, "short")).not.toThrow();
  expect(tab.getItem(key)).toBeNull();
});

it("surfaces malformed or unavailable storage instead of pretending counts were retained", () => {
  expect(() => readPickCounts(lines, "not-json")).toThrow();
  expect(() => readPickCounts(lines, '{"other":7}')).toThrow();
  const blocked = { ...storage(), setItem: () => { throw new Error("storage blocked"); } };
  expect(() => savePickCounts(blocked, key, lines, { short: "2", other: "6" })).toThrow("storage blocked");
});

it("isolates actor, brewery and order and retires completed or abandoned drafts", () => {
  const tab = storage();
  savePickCounts(tab, key, lines, { short: "0", other: "7" });
  for (const otherKey of [pickCountDraftKey({ actorId: "other", breweryId: "brewery" }, "order"), pickCountDraftKey({ actorId: "actor", breweryId: "other" }, "order"), pickCountDraftKey({ actorId: "actor", breweryId: "brewery" }, "other")]) {
    expect(readPickCounts(lines, tab.getItem(otherKey))).toEqual({ short: "5", other: "8" });
  }
  tab.removeItem(key);
  expect(readPickCounts(lines, tab.getItem(key))).toEqual({ short: "5", other: "8" });
});
