import type { OpenAICompatibleProviderSettings } from "@ai-sdk/openai-compatible";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const warned = { value: false };

export const createUnified = (arg?: Partial<OpenAICompatibleProviderSettings>) => {
	if (!warned.value) {
		warned.value = true;
		console.warn(
			'[ai-gateway-provider] Importing from "ai-gateway-provider/providers/unified" is deprecated. ' +
				'Use "@ai-sdk/openai-compatible" directly with createAIGateway() instead. ' +
				"This import will be removed in the next major version.",
		);
	}
	return createOpenAICompatible({
		baseURL: "https://gateway.ai.cloudflare.com/v1/compat",
		name: "Unified",
		...(arg || {}),
	});
};

let _unified: ReturnType<typeof createUnified> | undefined;
export const unified = new Proxy((() => {}) as unknown as ReturnType<typeof createUnified>, {
	get(_target, prop, receiver) {
		if (!_unified) _unified = createUnified();
		return Reflect.get(_unified, prop, receiver);
	},
	apply(_target, thisArg, args) {
		if (!_unified) _unified = createUnified();
		return Reflect.apply(_unified as any, thisArg, args);
	},
});
