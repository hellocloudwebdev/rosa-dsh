import type { ProviderKind } from "../../shared/types.js";
import type { ProviderAdapter } from "./base.js";
import { OpenAICompatibleAdapter, OpenAIAdapter } from "./openai.js";
import { AnthropicAdapter } from "./anthropic.js";
import { GoogleAdapter } from "./google.js";
import { AzureOpenAIAdapter } from "./azure.js";

/**
 * Adapter registry.
 *
 * Adding a provider with a proprietary wire format means writing one class and
 * adding one line here — nothing in the chat, comparison, metrics or UI layers
 * changes.
 */
const REGISTRY: Partial<Record<ProviderKind, () => ProviderAdapter>> = {
  openai: () => new OpenAIAdapter(),
  "openai-compatible": () => new OpenAICompatibleAdapter(),
  openrouter: () => new OpenAICompatibleAdapter(),
  groq: () => new OpenAICompatibleAdapter(),
  mistral: () => new OpenAICompatibleAdapter(),
  cohere: () => new OpenAICompatibleAdapter(),
  anthropic: () => new AnthropicAdapter(),
  google: () => new GoogleAdapter(),
  "azure-openai": () => new AzureOpenAIAdapter(),
  "neon-ai-gateway": () => new OpenAICompatibleAdapter(),
};

export function getAdapter(kind: ProviderKind): ProviderAdapter {
  const factory = REGISTRY[kind];
  if (!factory) {
    throw new Error(`No adapter registered for provider kind "${kind}".`);
  }
  return factory();
}

export function hasAdapter(kind: ProviderKind): boolean {
  return typeof REGISTRY[kind] === "function";
}

export type { ProviderAdapter };
export { OpenAICompatibleAdapter, OpenAIAdapter, AnthropicAdapter, GoogleAdapter, AzureOpenAIAdapter };
