// lib/mgr/repack-view.ts — the Repack sheet's model. The inventory draws the
// fixture (lib/mgr/fixtures/packaging.ts); the live sheet derives the outbound
// leg from the parent's composition through toRepackView, so nobody types both
// halves and the two legs cannot disagree on volume.
export type RepackViewModel = {
  parent: string;
  location: string;
  qty: string;
  unit: string;
  tape: [string, string][];
  preview: string;
  damaged: string;
  unavailable?: string;
};

/** Why the commit is withheld when the parent is not a composed format with exactly one component row. */
export const REPACK_UNAVAILABLE = "isn’t available yet: breaking a case has nowhere correct to land";

/** One parent format's single component row: what it breaks into, how many per parent unit, and the parent's bbl per unit. */
export type RepackComposition = { childLabel: string; quantity: number; parentBbl: number };

export function toRepackView(input: { parent: string; unit: string; location: string; qty: string; composition: RepackComposition | null }): RepackViewModel {
  const { parent, unit, location, qty, composition } = input;
  const n = Number(qty) || 0;
  if (!composition) {
    return { parent, location, qty, unit, tape: [[`−${n} ${unit} · repack`, "no composition"]], preview: "Preview: nothing to derive · the parent format has no single component row", damaged: "not recorded", unavailable: REPACK_UNAVAILABLE };
  }
  // The child leg's bbl is the parent's total, never recomputed per child unit
  // (screens.tsx spec: independent rounding leaves −0.00000001 on a 24×16oz case).
  const bbl = String(Number((n * composition.parentBbl).toFixed(6)));
  return {
    parent, location, qty, unit,
    tape: [[`−${n} ${unit} · repack`, `${bbl} bbl`], [`+${n * composition.quantity} ${composition.childLabel} · repack`, `derived from the ${unit} total`]],
    preview: `Preview: conserves ${bbl} bbl · same location and bin · not a TTB removal`,
    damaged: `0 ${composition.childLabel} · the child count is pinned to composition`,
  };
}
