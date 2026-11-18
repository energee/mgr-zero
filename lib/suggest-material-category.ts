// lib/suggest-material-category.ts — asks a decision model (Jev by default) for a new material's kind from its name.
// Server-only because the call uses AI Gateway credentials. The question and the
// confidence gate are pure, in `lib/mgr/material-category-suggestion.ts`, so the
// experiment script can import them under Bun, which cannot resolve "server-only".
import "server-only";
import { experimental_decide, type Experimental_DecisionModel } from "ai";
import {
  confidentChoice,
  MATERIAL_CATEGORY_MIN_PROBABILITY,
  materialCategoryQuestion,
  SUGGESTION_MODEL,
} from "@/lib/mgr/material-category-suggestion";

/** The suggested kind, or null when no kind reached the threshold. Errors (refusal, timeout, Gateway down) throw. */
export async function suggestMaterialCategory(name: string, model: Experimental_DecisionModel = SUGGESTION_MODEL) {
  const result = await experimental_decide({
    model,
    state: { materialName: name },
    questions: { category: materialCategoryQuestion() },
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(3000),
  });
  return confidentChoice(result.answers.category, MATERIAL_CATEGORY_MIN_PROBABILITY);
}
