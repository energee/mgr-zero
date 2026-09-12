"use client";

import Arcee from "@lobehub/icons/es/Arcee/components/Color";
import ByteDance from "@lobehub/icons/es/ByteDance/components/Color";
import Claude from "@lobehub/icons/es/Claude/components/Color";
import CommandA from "@lobehub/icons/es/CommandA/components/Color";
import DeepSeek from "@lobehub/icons/es/DeepSeek/components/Color";
import Gemini from "@lobehub/icons/es/Gemini/components/Color";
import Gemma from "@lobehub/icons/es/Gemma/components/Color";
import Grok from "@lobehub/icons/es/Grok/components/Mono";
import Hunyuan from "@lobehub/icons/es/Hunyuan/components/Color";
import Inception from "@lobehub/icons/es/Inception/components/Mono";
import Meta from "@lobehub/icons/es/Meta/components/Color";
import Minimax from "@lobehub/icons/es/Minimax/components/Color";
import Mistral from "@lobehub/icons/es/Mistral/components/Color";
import Kimi from "@lobehub/icons/es/Kimi/components/Color";
import KwaiKAT from "@lobehub/icons/es/KwaiKAT/components/Mono";
import Morph from "@lobehub/icons/es/Morph/components/Color";
import Nvidia from "@lobehub/icons/es/Nvidia/components/Color";
import Nova from "@lobehub/icons/es/Nova/components/Color";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import Perplexity from "@lobehub/icons/es/Perplexity/components/Color";
import Poolside from "@lobehub/icons/es/Poolside/components/Color";
import Qwen from "@lobehub/icons/es/Qwen/components/Color";
import Stepfun from "@lobehub/icons/es/Stepfun/components/Mono";
import Xiaomi from "@lobehub/icons/es/XiaomiMiMo/components/Mono";
import ZAI from "@lobehub/icons/es/ZAI/components/Mono";

const PROVIDER_ICONS = {
  alibaba: Qwen,
  amazon: Nova,
  anthropic: Claude,
  "arcee-ai": Arcee,
  bytedance: ByteDance,
  cohere: CommandA,
  deepseek: DeepSeek,
  google: Gemini,
  inception: Inception,
  kwaipilot: KwaiKAT,
  meta: Meta,
  minimax: Minimax,
  mistral: Mistral,
  moonshotai: Kimi,
  morph: Morph,
  nvidia: Nvidia,
  openai: OpenAI,
  perplexity: Perplexity,
  poolside: Poolside,
  spacexai: Grok,
  stepfun: Stepfun,
  tencent: Hunyuan,
  xiaomi: Xiaomi,
  zai: ZAI,
};

export function AiModelIcon({ modelId }: { modelId: string }) {
  const normalized = modelId.toLowerCase();
  const provider = normalized.split("/", 1)[0] ?? "";
  const Provider = normalized.startsWith("google/gemma") ? Gemma : PROVIDER_ICONS[provider as keyof typeof PROVIDER_ICONS];
  if (!Provider) return <span aria-hidden="true" title={provider} className="flex size-4 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium uppercase">{provider[0]}</span>;
  return <span aria-hidden="true" className="shrink-0"><Provider size={16} /></span>;
}
