// lib/suggest-material-category.ts — asks a decision model (Jev) for a new material's kind from its name.
// Server-only because the caller hands it a model built with the brewery's TypeSafe key. The question and the
// confidence gate are pure, in `lib/mgr/material-category-suggestion.ts`, so the
// experiment script can import them under Bun, which cannot resolve "server-only".
import "server-only";
import { APICallError, experimental_decide, type Experimental_DecisionModel } from "ai";
import { confidentChoice, MATERIAL_CATEGORY_MIN_PROBABILITY, materialCategoryQuestion, resolveDecisionModel, SUGGESTION_MODEL } from "@/lib/mgr/material-category-suggestion";

/** The suggested kind, or null when no kind reached the threshold. Errors (refusal, timeout, provider down) throw. */
export async function suggestMaterialCategory(name: string, model: Experimental_DecisionModel) {
  const result = await experimental_decide({
    model,
    state: { materialName: name },
    questions: { category: materialCategoryQuestion() },
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(3000),
  });
  return confidentChoice(result.answers.category, MATERIAL_CATEGORY_MIN_PROBABILITY);
}

/** Whether TypeSafe takes this key, checked before it is saved: "refused" when TypeSafe answers 401 or 403,
 *  "unreachable" for any other failure (timeout, outage). It asks one fixed made-up name, so no brewery text is sent. */
export async function checkTypeSafeKey(apiKey: string): Promise<"ok" | "refused" | "unreachable"> {
  try {
    await suggestMaterialCategory("Citra T-90", resolveDecisionModel(SUGGESTION_MODEL, apiKey));
    return "ok";
  } catch (error) {
    return APICallError.isInstance(error) && (error.statusCode === 401 || error.statusCode === 403) ? "refused" : "unreachable";
  }
}
