// tests/repack-view.test.ts — toRepackView: the live Repack sheet derives the
// outbound leg from the parent's composition; nobody types both halves.
import { describe, expect, it } from "vitest";
import { REPACK_UNAVAILABLE, toRepackView } from "@/lib/mgr/repack-view";

const base = { parent: "Hazy IPA · case · 24×16oz", unit: "case", location: "Warehouse · Walk-in", qty: "1" };

describe("toRepackView", () => {
  it("derives the child leg from composition and conserves the parent's bbl", () => {
    const model = toRepackView({ ...base, composition: { childLabel: "four-pack", quantity: 6, parentBbl: 0.096774 } });
    expect(model.tape[0]).toEqual(["−1 case · repack", "0.096774 bbl"]);
    expect(model.tape[1]).toEqual(["+6 four-pack · repack", "derived from the case total"]);
    expect(model.unavailable).toBeUndefined();
  });

  it("is unavailable when the parent has no single composition row", () => {
    const model = toRepackView({ ...base, composition: null });
    expect(model.unavailable).toBe(REPACK_UNAVAILABLE);
  });
});
