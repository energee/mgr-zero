// A recipe draft kept in this tab survives leaving the page, and an older base is flagged, not dropped.
import { expect, it } from "vitest";
import { readRecipeDraft, recipeDraftKey, shouldKeepDraft, writeRecipeDraft } from "@/lib/mgr/recipe-draft";
import type { RecipeDraft } from "@/lib/mgr/recipe-view";
import { EMPTY_WATER } from "@/lib/mgr/recipe-process-view";

const draft: RecipeDraft = {
  numbers: { preBoil: "10", boilMin: "60", whirlpoolMin: "", whirlpoolTemp: "", whirlpoolRest: "", knockoutTemp: "66", efficiency: "72.5", attenuation: "78" },
  notes: "More Citra",
  lines: [{ materialId: "m1", perBblQty: "1.2", stage: "dry_hop", timingMinutes: "" }],
  mashSchedule: [{ name: "Sacc", kind: "infusion", tempF: 152, minutes: 60 }],
  fermentationSchedule: [{ name: "Primary", kind: "primary", tempF: 66, days: 7 }],
  water: { ...EMPTY_WATER, mashGal: "120", additions: [{ materialId: "gyp", qty: 40, unit: "g", stage: "mash" }] },
};
function storage() {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
}
const key = "mgr:recipe-draft:actor:brewery:recipe";

it("round-trips a draft on the same base version", () => {
  const tab = storage();
  writeRecipeDraft(tab, key, "v2", draft);
  expect(readRecipeDraft(tab.getItem(key), "v2")).toEqual({ draft, stale: false });
});

it("flags a draft based on another version as stale instead of dropping it", () => {
  const tab = storage();
  writeRecipeDraft(tab, key, "v1", draft);
  expect(readRecipeDraft(tab.getItem(key), "v2")).toEqual({ draft, stale: true });
});

it("round-trips a draft with no base version", () => {
  const tab = storage();
  writeRecipeDraft(tab, key, null, draft);
  expect(readRecipeDraft(tab.getItem(key), null)).toEqual({ draft, stale: false });
});

it("returns null when nothing is stored", () => {
  expect(readRecipeDraft(null, "v2")).toBeNull();
});

it("throws on a malformed record", () => {
  expect(() => readRecipeDraft("{not json", "v2")).toThrow();
  expect(() => readRecipeDraft(JSON.stringify({ baseVersionId: "v2", draft: { notes: 3 } }), "v2")).toThrow();
});

it("names actor, brewery and recipe in the key", () => {
  expect(recipeDraftKey({ actorId: "actor", breweryId: "brewery" } as Parameters<typeof recipeDraftKey>[0], "recipe")).toBe(key);
});

it("keeps nothing for an untouched copy, so returning shows no notice", () => {
  expect(shouldKeepDraft(draft, structuredClone(draft))).toBe(false);
  // A sheet that hands back the same line with its keys in another order is still untouched.
  const reordered = { ...draft, lines: [{ timingMinutes: "", stage: "dry_hop" as const, perBblQty: "1.2", materialId: "m1" }] };
  expect(shouldKeepDraft(draft, reordered)).toBe(false);
});

it("keeps a draft once one dry hop changes", () => {
  expect(shouldKeepDraft(draft, { ...draft, lines: [{ ...draft.lines[0], perBblQty: "1.5" }] })).toBe(true);
});
