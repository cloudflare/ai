import type { OpenAICompatibleProviderSettings } from "@ai-sdk/openai-compatible";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * @deprecated Call the model by its AI Gateway catalog id with `createAI`
 * from `agents/models/ai-sdk`: `ai("anthropic/claude-opus-4.8")`.
 */
export const createUnified = (arg?: Partial<OpenAICompatibleProviderSettings>) => {
	return createOpenAICompatible({
		baseURL: "https://gateway.ai.cloudflare.com/v1/compat", // intercepted and replaced with actual base URL later
		name: "Unified",
		...(arg || {}),
	});
};

/**
 * @deprecated Call the model by its AI Gateway catalog id with `createAI`
 * from `agents/models/ai-sdk`: `ai("anthropic/claude-opus-4.8")`.
 */
export const unified = createUnified();
