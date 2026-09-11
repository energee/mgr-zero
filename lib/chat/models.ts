import { gateway } from "ai";

export const DEFAULT_CHAT_MODEL = "anthropic/claude-sonnet-4.5";
const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i;

export type GatewayModelOption = { id: string; name: string };
type GatewayModel = GatewayModelOption & { modelType?: string | null };

export function chatModelFromSettings(settings: unknown, fallback = DEFAULT_CHAT_MODEL) {
  const model = settings && typeof settings === "object" && "ai_model" in settings
    ? (settings as { ai_model?: unknown }).ai_model
    : undefined;
  return typeof model === "string" && MODEL_ID.test(model) ? model : fallback;
}

export function gatewayLanguageModels(models: GatewayModel[]): GatewayModelOption[] {
  return models
    .filter((model) => model.modelType == null || model.modelType === "language")
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGatewayLanguageModels() {
  return gatewayLanguageModels((await gateway.getAvailableModels()).models);
}
