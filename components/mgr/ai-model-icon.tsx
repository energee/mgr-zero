"use client";

import Alibaba from "@lobehub/icons/es/Alibaba/components/Color";
import Anthropic from "@lobehub/icons/es/Anthropic/components/Mono";
import Aws from "@lobehub/icons/es/Aws/components/Color";
import ByteDance from "@lobehub/icons/es/ByteDance/components/Color";
import Cohere from "@lobehub/icons/es/Cohere/components/Color";
import DeepSeek from "@lobehub/icons/es/DeepSeek/components/Color";
import Google from "@lobehub/icons/es/Google/components/Color";
import Meta from "@lobehub/icons/es/MetaAI/components/Color";
import Minimax from "@lobehub/icons/es/Minimax/components/Color";
import Mistral from "@lobehub/icons/es/Mistral/components/Color";
import Kimi from "@lobehub/icons/es/Kimi/components/Color";
import Nvidia from "@lobehub/icons/es/Nvidia/components/Color";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import Perplexity from "@lobehub/icons/es/Perplexity/components/Color";
import Stepfun from "@lobehub/icons/es/Stepfun/components/Mono";
import Tencent from "@lobehub/icons/es/Tencent/components/Color";
import Vercel from "@lobehub/icons/es/Vercel/components/Mono";
import XAI from "@lobehub/icons/es/XAI/components/Mono";
import Xiaomi from "@lobehub/icons/es/XiaomiMiMo/components/Mono";
import ZAI from "@lobehub/icons/es/ZAI/components/Mono";

const PROVIDER_ICONS = {
  alibaba: Alibaba,
  amazon: Aws,
  anthropic: Anthropic,
  bytedance: ByteDance,
  cohere: Cohere,
  deepseek: DeepSeek,
  google: Google,
  meta: Meta,
  minimax: Minimax,
  mistral: Mistral,
  moonshotai: Kimi,
  nvidia: Nvidia,
  openai: OpenAI,
  perplexity: Perplexity,
  spacexai: XAI,
  stepfun: Stepfun,
  tencent: Tencent,
  xiaomi: Xiaomi,
  zai: ZAI,
};

export function AiModelIcon({ modelId }: { modelId: string }) {
  const provider = modelId.split("/", 1)[0]?.toLowerCase() ?? "";
  const Provider = PROVIDER_ICONS[provider as keyof typeof PROVIDER_ICONS] ?? Vercel;
  return <span aria-hidden="true" className="shrink-0"><Provider size={16} /></span>;
}
