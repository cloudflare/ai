import { AISearchChatLanguageModel } from "./aisearch-chat-language-model";
import type { AISearchChatSettings } from "./aisearch-chat-settings";

export type { AISearchChatSettings } from "./aisearch-chat-settings";

export type AISearchNamespaceSettings = {
	binding: AiSearchNamespace;
};

type BoundAISearchItems = AiSearchInstance["items"];
type BoundAISearchItem = ReturnType<BoundAISearchItems["get"]>;

export interface AISearchItemProvider {
	info: BoundAISearchItem["info"];
	download: BoundAISearchItem["download"];
}

export interface AISearchItemsProvider {
	list: BoundAISearchItems["list"];
	upload: BoundAISearchItems["upload"];
	uploadAndPoll: BoundAISearchItems["uploadAndPoll"];
	delete: BoundAISearchItems["delete"];
	get(itemId: string): AISearchItemProvider;
}

export interface AISearchInstanceProvider {
	/**
	 * Creates an AI SDK model backed by AI Search chat completions.
	 */
	chat(settings?: AISearchChatSettings): AISearchChatLanguageModel;
	/**
	 * Search this AI Search instance for relevant chunks.
	 */
	search: AiSearchInstance["search"];
	/**
	 * Upload, list, and delete source items.
	 */
	items: AISearchItemsProvider;
}

export interface AISearchNamespaceProvider {
	/**
	 * Returns a client for an instance in the bound namespace. Synchronous and
	 * lazy — no network call is made until you use the returned client.
	 */
	get(instanceName: string): AISearchInstanceProvider;
	/**
	 * List instances in the bound namespace.
	 */
	list: AiSearchNamespace["list"];
}

function createChatModel(binding: AiSearchInstance, settings: AISearchChatSettings = {}) {
	// The modelId is a display label only: AI Search uses the instance's
	// configured model, and buildRequest omits `model` unless settings.model is set.
	return new AISearchChatLanguageModel(settings.model ?? "default", settings, {
		binding,
		provider: "aisearch.chat",
	});
}

function createItemsProvider(items: BoundAISearchItems): AISearchItemsProvider {
	return {
		list: (params) => items.list(params),
		upload: (name, content, options) => items.upload(name, content, options),
		uploadAndPoll: (name, content, options) => items.uploadAndPoll(name, content, options),
		delete: (itemId) => items.delete(itemId),
		get(itemId) {
			const item = items.get(itemId);
			return {
				info: () => item.info(),
				download: () => item.download(),
			};
		},
	};
}

function createInstanceProvider(binding: AiSearchInstance): AISearchInstanceProvider {
	return {
		chat: (settings: AISearchChatSettings = {}) => createChatModel(binding, settings),
		search: (params) => binding.search(params),
		items: createItemsProvider(binding.items),
	};
}

/**
 * Create an AI Search provider from an `ai_search_namespaces` binding.
 *
 * A `default` namespace exists for every account — bind `ai_search_namespaces`
 * to `default` if you don't need multiple namespaces, then call `.get(instanceName)`
 * to work with a specific instance.
 * @see https://developers.cloudflare.com/ai-search/concepts/namespaces/
 */
export function createAISearchNamespace(
	options: AISearchNamespaceSettings,
): AISearchNamespaceProvider {
	const binding = options.binding;
	return {
		get: (instanceName: string) => createInstanceProvider(binding.get(instanceName)),
		list: (params) => binding.list(params),
	};
}

export { AISearchChatLanguageModel };
