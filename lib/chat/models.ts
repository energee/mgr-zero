import { gateway } from "ai";
import { unstable_cache } from "next/cache";

export const DEFAULT_CHAT_MODEL = "minimax/minimax-m3.1-flash";
/** Gateway model ids are `provider/model`; the same shape the database check enforces. */
export const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i;

/** A model Settings offers: its id and display name. Gateway also returns
 *  pricing, which Settings does not show (#1147), so it is not passed on. */
export type GatewayModelOption = { id: string; name: string };
type GatewayModel = GatewayModelOption & { modelType?: string | null };

export function chatModelFromSettings(settings: unknown, fallback = DEFAULT_CHAT_MODEL) {
  const model = settings && typeof settings === "object" && "ai_model" in settings
    ? (settings as { ai_model?: unknown }).ai_model
    : undefined;
  return typeof model === "string" && MODEL_ID.test(model) ? model : fallback;
}

/** The id's namespace — "anthropic" in "anthropic/claude-sonnet-4.5". Gateway
 *  names carry only the model ("Claude Sonnet 4.5"), so the provider has to
 *  come from the id wherever the catalog is shown or searched. */
export const modelProvider = (id: string) => id.toLowerCase().split("/", 1)[0] ?? "";

/** Search a model by provider as well as name: "anthro" finds Claude. */
export const modelMatches = (model: GatewayModelOption, query: string) => {
  const needle = query.trim().toLowerCase();
  return model.name.toLowerCase().includes(needle) || model.id.toLowerCase().includes(needle);
};

export function gatewayLanguageModels(models: GatewayModel[]): GatewayModelOption[] {
  return models
    .filter((model) => model.modelType == null || model.modelType === "language")
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => modelProvider(a.id).localeCompare(modelProvider(b.id)) || a.name.localeCompare(b.name));
}

/** The catalog changes rarely, so one Gateway read serves every Settings load
 *  for an hour instead of each render waiting on it (#1491). A failed read
 *  throws out of the cache, so it is never kept. */
const cachedLanguageModels = unstable_cache(
  async () => gatewayLanguageModels((await gateway.getAvailableModels()).models),
  ["gateway-language-models"],
  { revalidate: 3600 },
);

/** The Gateway's language models, or an empty catalog when the Gateway read
 *  fails. Empty is safe: Settings then says the catalog is unavailable and
 *  keeps the saved model. The cause is logged so the outage is not silent,
 *  and the empty catalog is not cached, so the next load reads again. */
export async function getGatewayLanguageModels(): Promise<GatewayModelOption[]> {
  try {
    return await cachedLanguageModels();
  } catch (error) {
    console.error("gateway model catalog unavailable:", error instanceof Error ? error.message : String(error));
    return [];
  }
}
