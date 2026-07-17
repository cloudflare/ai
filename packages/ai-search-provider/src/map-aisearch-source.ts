import type { JSONObject, JSONValue } from "@ai-sdk/provider";

export type AISearchChunk = AiSearchSearchResponse["chunks"][number] & {
	instance_id?: string;
};

/**
 * Coerce an arbitrary binding value into a `JSONValue`. AI Search chunk fields
 * (`item.metadata`, `scoring_details`, …) are typed as `unknown`, but a source's
 * `providerMetadata` must be JSON-serializable — so we deep-copy the JSON-safe
 * parts and drop anything that isn't (`undefined`, functions) rather than casting
 * and risking non-JSON data leaking through.
 */
function toJSONValue(value: unknown): JSONValue | undefined {
	if (
		value == null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((entry) => toJSONValue(entry) ?? null);
	}

	if (typeof value === "object") {
		const object: JSONObject = {};
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			const jsonValue = toJSONValue(entry);
			if (jsonValue !== undefined) {
				object[key] = jsonValue;
			}
		}
		return object;
	}

	return undefined;
}

function setJSONAttribute(target: JSONObject, key: string, value: unknown) {
	const jsonValue = toJSONValue(value);
	if (jsonValue !== undefined) {
		target[key] = jsonValue;
	}
}

/**
 * Map a retrieved AI Search chunk to an AI SDK `source` content part.
 *
 * `sourceType` is a fixed AI SDK enum (`"url" | "document"`); we use `"url"`
 * because a chunk's `item.key` is documented as "the file path or URL of the
 * source document" — a real URL for web-crawler instances, a path otherwise.
 * The raw chunk fields (score, item, scoring_details, instance_id) are exposed
 * under `providerMetadata.aisearch` for consumers that want them.
 */
export function mapAISearchChunkToSource(chunk: AISearchChunk) {
	const attributes: JSONObject = {};
	setJSONAttribute(attributes, "instance_id", chunk.instance_id);
	setJSONAttribute(attributes, "item", chunk.item);
	setJSONAttribute(attributes, "score", chunk.score);
	setJSONAttribute(attributes, "scoring_details", chunk.scoring_details);

	return {
		type: "source" as const,
		sourceType: "url" as const,
		id: chunk.id,
		url: chunk.item?.key ?? chunk.id,
		providerMetadata: { aisearch: attributes },
	};
}
