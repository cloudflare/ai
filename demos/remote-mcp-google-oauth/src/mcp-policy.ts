/**
 * Read-only policy for the Amat MCP relay, applied to the JSON-RPC messages of the
 * MCP Streamable HTTP transport.
 *
 * The Amat server (mcp-server-odoo) lists its write tools even when Odoo refuses writes,
 * so the relay enforces read-only access itself: a `tools/call` for any tool not listed
 * below is answered by the relay and never forwarded, and `tools/list` results are
 * filtered so clients only see the read tools. Tools a future server version adds stay
 * blocked until they are reviewed and added here.
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
	"aggregate_records",
	"get_current_context",
	"get_fields",
	"get_record",
	"list_models",
	"list_record_attachments",
	"list_resource_templates",
	"read_attachment",
	"search_records",
]);

/**
 * Requests a client may send, from the MCP specification. Any other method is answered by
 * the relay with "Method not found", so a capability a future server version adds stays
 * unreachable until it is reviewed here. Notifications (`notifications/...`) and responses
 * to server-initiated requests always pass.
 */
export const ALLOWED_RPC_METHODS: ReadonlySet<string> = new Set([
	"initialize",
	"ping",
	"tools/list",
	"tools/call",
	"resources/list",
	"resources/templates/list",
	"resources/read",
	"resources/subscribe",
	"resources/unsubscribe",
	"prompts/list",
	"prompts/get",
	"completion/complete",
	"logging/setLevel",
	"tasks/get",
	"tasks/result",
	"tasks/list",
	"tasks/cancel",
]);

const MAX_BATCH_SIZE = 50;

type JsonRpcId = string | number;
type JsonObject = Record<string, unknown>;

export type Blocked = { id: unknown; kind: "method" | "tool"; name: string };

export type InspectedPayload = {
	/**
	 * The payload re-serialized from what was inspected. It is what the relay forwards, so
	 * the upstream parser cannot read something else (for example the other value of a
	 * duplicated key).
	 */
	body: string;
	isBatch: boolean;
	messageCount: number;
	/** Methods of the requests and notifications, for audit logs. */
	methods: string[];
	/** Read tools being called, for audit logs. */
	tools: string[];
	blocked: Blocked[];
	/** Keys (see idKey) of the tools/list requests whose results must be filtered. */
	toolsListIds: Set<string>;
};

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A key that keeps JSON-RPC ids `1` and `"1"` distinct. */
export function idKey(id: unknown): string | null {
	if (typeof id === "string") return `s:${id}`;
	if (typeof id === "number") return `n:${id}`;
	return null;
}

/**
 * Whether the parsed JSON holds a number JavaScript cannot represent exactly (an integer
 * beyond 2^53, or one too large for a double). Python reads those differently, so such a
 * payload is refused rather than re-serialized with another value.
 */
function hasInexactNumber(value: unknown): boolean {
	const stack: unknown[] = [value];
	while (stack.length > 0) {
		const current = stack.pop();
		if (typeof current === "number") {
			if (!Number.isFinite(current)) return true;
			if (Number.isInteger(current) && !Number.isSafeInteger(current)) return true;
		} else if (Array.isArray(current)) {
			for (const item of current) stack.push(item);
		} else if (isObject(current)) {
			for (const item of Object.values(current)) stack.push(item);
		}
	}
	return false;
}

/**
 * Parses a client POST body. Returns null unless it is one JSON-RPC 2.0 message or a
 * non-empty batch of them, so anything the relay cannot classify is never forwarded.
 */
export function inspectJsonRpcPayload(text: string): InspectedPayload | null {
	let parsed: unknown;
	let body: string;
	try {
		parsed = JSON.parse(text);
		if (hasInexactNumber(parsed)) return null;
		body = JSON.stringify(parsed);
	} catch {
		return null;
	}
	const isBatch = Array.isArray(parsed);
	const messages: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
	if (messages.length === 0 || messages.length > MAX_BATCH_SIZE) return null;

	const result: InspectedPayload = {
		body,
		isBatch,
		messageCount: messages.length,
		methods: [],
		tools: [],
		blocked: [],
		toolsListIds: new Set(),
	};
	for (const message of messages) {
		if (!isObject(message) || message.jsonrpc !== "2.0") return null;
		if (!("method" in message)) continue; // a response to a server-initiated request
		const { method } = message;
		if (typeof method !== "string") return null;
		result.methods.push(method);

		if (!method.startsWith("notifications/") && !ALLOWED_RPC_METHODS.has(method)) {
			result.blocked.push({ id: message.id, kind: "method", name: method.slice(0, 100) });
		} else if (method === "tools/call") {
			const name = isObject(message.params) ? message.params.name : undefined;
			if (typeof name === "string" && READ_ONLY_TOOLS.has(name)) {
				result.tools.push(name);
			} else {
				result.blocked.push({
					id: message.id,
					kind: "tool",
					name: typeof name === "string" ? name.slice(0, 100) : "",
				});
			}
		} else if (method === "tools/list") {
			const key = idKey(message.id);
			if (key) result.toolsListIds.add(key);
		}
	}
	return result;
}

/** The JSON-RPC error the relay returns for a method it does not forward. */
export function blockedMethodResult(id: JsonRpcId): JsonObject {
	return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
}

/** The tool result the relay returns instead of forwarding a write tool call. */
export function blockedToolCallResult(id: JsonRpcId, tool: string): JsonObject {
	return {
		jsonrpc: "2.0",
		id,
		result: {
			content: [
				{
					type: "text",
					text: `L'outil "${tool}" n'est pas disponible : ce connecteur donne un accès en lecture seule aux données Odoo d'Amat.`,
				},
			],
			isError: true,
		},
	};
}

function isToolsListResult(message: unknown, ids: Set<string>): message is JsonObject {
	if (!isObject(message) || !isObject(message.result) || !Array.isArray(message.result.tools)) {
		return false;
	}
	const key = idKey(message.id);
	return key !== null && ids.has(key);
}

function filterToolsListMessage(message: unknown, ids: Set<string>): unknown {
	if (!isToolsListResult(message, ids)) return message;
	const result = message.result as JsonObject;
	return {
		...message,
		result: {
			...result,
			tools: (result.tools as unknown[]).filter(
				(tool) =>
					isObject(tool) &&
					typeof tool.name === "string" &&
					READ_ONLY_TOOLS.has(tool.name),
			),
		},
	};
}

/**
 * Removes non-read tools from the tools/list results in one JSON-RPC payload (a message
 * or a batch). Returns null when the payload holds no such result, so the caller passes
 * it on unchanged.
 */
export function filterToolsListPayload(text: string, ids: Set<string>): string | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	const messages = Array.isArray(parsed) ? parsed : [parsed];
	if (!messages.some((message) => isToolsListResult(message, ids))) return null;
	const filtered = Array.isArray(parsed)
		? parsed.map((message) => filterToolsListMessage(message, ids))
		: filterToolsListMessage(parsed, ids);
	return JSON.stringify(filtered);
}

/**
 * Applies filterToolsListPayload to each event of a `text/event-stream` body. Lines are
 * split on CRLF, LF or CR as the SSE format allows; an event whose data is not a matching
 * tools/list result is re-emitted with its lines unchanged.
 */
export function createSseToolsListFilter(
	ids: Set<string>,
): TransformStream<Uint8Array, Uint8Array> {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffer = "";
	let scanFrom = 0;
	let eventLines: string[] = [];

	const dispatch = (controller: TransformStreamDefaultController<Uint8Array>) => {
		if (eventLines.length === 0) return;
		const dataIndexes = new Set<number>();
		const dataValues: string[] = [];
		eventLines.forEach((line, index) => {
			if (line === "data" || line.startsWith("data:")) {
				dataIndexes.add(index);
				const value = line.slice(5);
				dataValues.push(value.startsWith(" ") ? value.slice(1) : value);
			}
		});
		let lines = eventLines;
		const filtered =
			dataValues.length > 0 ? filterToolsListPayload(dataValues.join("\n"), ids) : null;
		if (filtered !== null) {
			// One data line carries the rewritten payload; the other fields stay as they were.
			const [firstData] = dataIndexes;
			lines = [];
			eventLines.forEach((line, index) => {
				if (index === firstData) lines.push(`data: ${filtered}`);
				else if (!dataIndexes.has(index)) lines.push(line);
			});
		}
		controller.enqueue(encoder.encode(`${lines.join("\n")}\n\n`));
		eventLines = [];
	};

	const processLines = (
		controller: TransformStreamDefaultController<Uint8Array>,
		final: boolean,
	) => {
		let start = 0;
		let i = scanFrom;
		while (i < buffer.length) {
			const char = buffer[i];
			if (char !== "\n" && char !== "\r") {
				i++;
				continue;
			}
			let next = i + 1;
			if (char === "\r") {
				// A CR at the end of a chunk may be the first half of a CRLF.
				if (next === buffer.length && !final) break;
				if (buffer[next] === "\n") next++;
			}
			const line = buffer.slice(start, i);
			if (line === "") dispatch(controller);
			else eventLines.push(line);
			start = next;
			i = next;
		}
		buffer = buffer.slice(start);
		scanFrom = i - start;
	};

	return new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			buffer += decoder.decode(chunk, { stream: true });
			processLines(controller, false);
		},
		flush(controller) {
			buffer += decoder.decode();
			processLines(controller, true);
			// An unterminated last event is passed on as it arrived.
			if (buffer.length > 0) eventLines.push(buffer);
			if (eventLines.length > 0) controller.enqueue(encoder.encode(eventLines.join("\n")));
		},
	});
}
