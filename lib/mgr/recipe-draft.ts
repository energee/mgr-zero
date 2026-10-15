// lib/mgr/recipe-draft.ts — the unsaved recipe draft kept in sessionStorage per
// actor, brewery and recipe, so leaving the page in the same tab does not lose it
// (decision 6). It holds editor text only, never a command or its result. A sibling
// of pick-counts.ts: a recipe draft has its own shape, so it has its own schema.
// The draft starts as a copy of the current version (versionToDraft), so it is
// kept only once it differs from that copy (shouldKeepDraft).
import { z } from "zod";
import type { CommandContextExpectation } from "@/lib/commands/registry";
import { INGREDIENT_STAGES } from "./recipe-process-view";
import type { RecipeDraft } from "./recipe-view";

const numberText = z.string();
const draftShape = z.object({
  numbers: z.object({
    preBoil: numberText, boilMin: numberText, whirlpoolMin: numberText, whirlpoolTemp: numberText,
    whirlpoolRest: numberText, knockoutTemp: numberText, efficiency: numberText, attenuation: numberText,
  }),
  notes: z.string(),
  lines: z.array(z.object({ materialId: z.string(), perBblQty: z.string(), stage: z.enum(INGREDIENT_STAGES), timingMinutes: z.string() })),
  mashSchedule: z.array(z.object({ name: z.string(), kind: z.string(), tempF: z.number(), minutes: z.number() })),
  fermentationSchedule: z.array(z.object({ name: z.string(), kind: z.string(), tempF: z.number(), days: z.number() })),
  water: z.object({
    targetProfileId: z.string(), sourceProfileId: z.string(), mashGal: z.string(), spargeGal: z.string(), targetMashPh: z.string(),
    additions: z.array(z.object({ materialId: z.string(), qty: z.number(), unit: z.string(), stage: z.string() })),
  }),
}) satisfies z.ZodType<RecipeDraft>;
const keptDraft = z.object({ baseVersionId: z.string().nullable(), draft: draftShape });
type DraftStorage = Pick<Storage, "setItem">;

/** A kept draft is private to this actor, brewery, recipe and browser tab. */
export function recipeDraftKey(context: CommandContextExpectation, recipeId: string) {
  return `mgr:recipe-draft:${context.actorId}:${context.breweryId}:${recipeId}`;
}

/** The kept draft, or null when nothing is stored. A draft started from another
 *  version comes back with stale: true, so the form can say so rather than drop
 *  the brewer's work. A malformed record throws; the form decides what to do. */
export function readRecipeDraft(saved: string | null, baseVersionId: string | null): { draft: RecipeDraft; stale: boolean } | null {
  if (saved === null) return null;
  const kept = keptDraft.parse(JSON.parse(saved));
  return { draft: kept.draft, stale: kept.baseVersionId !== baseVersionId };
}

/** Keep the draft with the version it started from. Storage errors reach the form. */
export function writeRecipeDraft(storage: DraftStorage, key: string, baseVersionId: string | null, draft: RecipeDraft) {
  storage.setItem(key, JSON.stringify({ baseVersionId, draft }));
}

/** True once the brewer has changed the draft from the copy it started as. An untouched
 *  copy is not kept, so opening the editor and leaving shows no notice on return.
 *  Both sides go through the schema first, so key order inside a line does not count as a change. */
export function shouldKeepDraft(initial: RecipeDraft, current: RecipeDraft): boolean {
  return JSON.stringify(draftShape.parse(initial)) !== JSON.stringify(draftShape.parse(current));
}
