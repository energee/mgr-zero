import { gateway } from "ai";

export const DEFAULT_CHAT_MODEL = "anthropic/claude-sonnet-4.5";
/** Gateway model ids are `provider/model`; the same shape the database check enforces. */
export const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i;

export type GatewayModelOption = { id: string; name: string; pricing?: { input: string; output: string } | null };
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
    .map(({ id, name, pricing }) => ({ id, name, ...(pricing ? { pricing } : {}) }))
    .sort((a, b) => modelProvider(a.id).localeCompare(modelProvider(b.id)) || a.name.localeCompare(b.name));
}

export async function getGatewayLanguageModels() {
  return gatewayLanguageModels((await gateway.getAvailableModels()).models);
}
