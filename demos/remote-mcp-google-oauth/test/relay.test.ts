import { afterEach, describe, expect, it, vi } from "vitest";
import { createAmatRelay, DEFAULT_LIMITS, type RelayLimits } from "../src/amat-relay";
import {
	ALLOWED_RPC_METHODS,
	createSseToolsListFilter,
	idKey,
	READ_ONLY_TOOLS,
} from "../src/mcp-policy";
import { AMAT_SECRET, AMAT_URL, env, mcpRequest, mockUpstreams, RESOURCE } from "./helpers";

afterEach(() => {
	vi.restoreAllMocks();
});

const WRITE_TOOLS = [
	"create_record",
	"create_records",
	"update_record",
	"update_records",
	"delete_record",
	"post_message",
	"upload_attachment",
	"call_model_method",
];

/**
 * Calls the relay as the OAuth provider does once a token is valid: `ctx.props` holds what
 * the Google callback stored for the user.
 */
function relay(
	request: Request,
	options: { email?: string | null; env?: Partial<Env>; limits?: Partial<RelayLimits> } = {},
): Promise<Response> {
	const email = options.email === undefined ? "bangaly@nasta-univers.com" : options.email;
	const ctx = {
		passThroughOnException() {},
		props: email === null ? undefined : { email, name: "Test User", sub: "1234567890" },
		waitUntil() {},
	} as unknown as ExecutionContext;
	return createAmatRelay({ ...DEFAULT_LIMITS, ...options.limits }).fetch(
		request,
		{ ...env, ...options.env } as Env,
		ctx,
	);
}

function sse(...events: string[]): string {
	return events.map((event) => `${event}\n\n`).join("");
}

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
}

const toolsListResult = (id: number | string) => ({
	id,
	jsonrpc: "2.0",
	result: {
		nextCursor: "page-2",
		tools: [
			{ inputSchema: {}, name: "search_records" },
			{ inputSchema: {}, name: "create_record" },
			{ inputSchema: {}, name: "get_record" },
			{ inputSchema: {}, name: "delete_record" },
			{ inputSchema: {}, name: "call_model_method" },
		],
	},
});

describe("who may use the relay", () => {
	it.each([
		["no identity", null],
		["an account removed from the allowlist", "ancien@nasta-univers.com"],
	])("refuses %s without contacting Amat", async (_label, email) => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }), {
			email,
		});
		expect(response.status).toBe(403);
		expect(upstreams.calls).toHaveLength(0);
	});
});

describe("destination and credentials", () => {
	it("sends the request only to the Amat URL, with the shared secret added server side", async () => {
		const upstreams = mockUpstreams({
			amat: () => Response.json({ id: 1, jsonrpc: "2.0", result: {} }),
		});
		const body = {
			id: 1,
			jsonrpc: "2.0",
			method: "tools/call",
			params: { arguments: {}, name: "list_models" },
		};
		const response = await relay(
			mcpRequest(body, {
				Authorization: "Bearer mcp-access-token",
				Cookie: "__Host-oauth-approvals=x",
				"Mcp-Session-Id": "session-1",
				"MCP-Protocol-Version": "2025-06-18",
				Origin: "https://evil.example",
				"User-Agent": "Claude-User",
				"X-Access-Token": "attacker-chosen",
				"X-Forwarded-Host": "evil.example",
			}),
		);
		expect(response.status).toBe(200);

		const [call] = upstreams.calls;
		expect(upstreams.calls).toHaveLength(1);
		expect(call.url).toBe(AMAT_URL);
		expect(call.method).toBe("POST");
		expect(call.redirect).toBe("manual");
		expect(JSON.parse(call.body)).toEqual(body);
		expect(call.headers.get("X-Access-Token")).toBe(AMAT_SECRET);
		expect(call.headers.get("Mcp-Session-Id")).toBe("session-1");
		expect(call.headers.get("MCP-Protocol-Version")).toBe("2025-06-18");
		expect(call.headers.get("Accept")).toBe("application/json, text/event-stream");
		expect(call.headers.get("Content-Type")).toBe("application/json");
		for (const name of [
			"Authorization",
			"Cookie",
			"Origin",
			"User-Agent",
			"X-Forwarded-Host",
		]) {
			expect(call.headers.has(name)).toBe(false);
		}
	});

	it("ignores anything in the client URL that could name another destination", async () => {
		const upstreams = mockUpstreams({
			amat: () => Response.json({ id: 1, jsonrpc: "2.0", result: {} }),
		});
		await relay(
			mcpRequest(
				{ id: 1, jsonrpc: "2.0", method: "ping" },
				{},
				`${RESOURCE}?url=https://evil.example/mcp&target=//evil.example`,
			),
		);
		expect(upstreams.calls.map((call) => call.url)).toEqual([AMAT_URL]);
	});

	it("serves only /mcp itself", async () => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await relay(
			mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }, {}, `${RESOURCE}/admin`),
		);
		expect(response.status).toBe(404);
		expect(upstreams.calls).toHaveLength(0);
	});

	it("accepts the documented trailing-slash form of the Amat URL", async () => {
		const upstreams = mockUpstreams({
			amat: () => Response.json({ id: 1, jsonrpc: "2.0", result: {} }),
		});
		await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }), {
			env: { AMAT_MCP_URL: `${AMAT_URL}/` },
		});
		expect(upstreams.calls.map((call) => call.url)).toEqual([`${AMAT_URL}/`]);
	});

	it.each([
		"https://evil.example/mcp",
		"http://mcp-amat.nasta-univers.com/mcp",
		"https://mcp-amat.nasta-univers.com.evil.example/mcp",
		"https://mcp-amat.nasta-univers.com:8443/mcp",
		"https://mcp-amat.nasta-univers.com/other",
		"https://user@mcp-amat.nasta-univers.com/mcp",
		"http://127.0.0.1:8024/mcp",
		"",
	])("refuses to start when AMAT_MCP_URL is %j", async (url) => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }), {
			env: { AMAT_MCP_URL: url },
		});
		expect(response.status).toBe(500);
		expect(upstreams.calls).toHaveLength(0);
		expect(await response.text()).not.toContain(AMAT_SECRET);
	});

	it("refuses to run without the shared secret", async () => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }), {
			env: { AMAT_ACCESS_TOKEN: "" },
		});
		expect(response.status).toBe(500);
		expect(upstreams.calls).toHaveLength(0);
	});
});

describe("Streamable HTTP transport", () => {
	it.each(["PUT", "PATCH", "HEAD", "OPTIONS"])("refuses %s", async (method) => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await relay(new Request(RESOURCE, { method }));
		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")).toBe("GET, POST, DELETE");
		expect(upstreams.calls).toHaveLength(0);
	});

	it("keeps the session: initialize, a request in the session, then DELETE", async () => {
		const upstreams = mockUpstreams({
			amat: (request) => {
				if (request.method === "DELETE") return new Response(null, { status: 200 });
				return new Response(
					sse(
						`event: message\ndata: ${JSON.stringify({ id: 1, jsonrpc: "2.0", result: { protocolVersion: "2025-06-18" } })}`,
					),
					{
						headers: {
							"Content-Type": "text/event-stream",
							"Mcp-Session-Id": "abc-123",
						},
					},
				);
			},
		});

		const initialize = await relay(
			mcpRequest({
				id: 1,
				jsonrpc: "2.0",
				method: "initialize",
				params: { protocolVersion: "2025-06-18" },
			}),
		);
		expect(initialize.status).toBe(200);
		expect(initialize.headers.get("Mcp-Session-Id")).toBe("abc-123");
		expect(initialize.headers.get("Content-Type")).toBe("text/event-stream");
		expect(await initialize.text()).toContain('"protocolVersion":"2025-06-18"');

		await relay(
			mcpRequest(
				{ jsonrpc: "2.0", method: "notifications/initialized" },
				{ "Mcp-Session-Id": "abc-123" },
			),
		);
		const ended = await relay(
			new Request(RESOURCE, { headers: { "Mcp-Session-Id": "abc-123" }, method: "DELETE" }),
		);
		expect(ended.status).toBe(200);

		expect(
			upstreams.calls.map((call) => [call.method, call.headers.get("Mcp-Session-Id")]),
		).toEqual([
			["POST", null],
			["POST", "abc-123"],
			["DELETE", "abc-123"],
		]);
		expect(upstreams.calls[2].body).toBe("");
		for (const call of upstreams.calls)
			expect(call.headers.get("X-Access-Token")).toBe(AMAT_SECRET);
	});

	it("passes on 202 Accepted for notifications", async () => {
		mockUpstreams({ amat: () => new Response(null, { status: 202 }) });
		const response = await relay(
			mcpRequest({ jsonrpc: "2.0", method: "notifications/initialized" }),
		);
		expect(response.status).toBe(202);
		expect(response.body).toBeNull();
	});

	it("passes on 404 so the client re-initializes an expired session", async () => {
		mockUpstreams({
			amat: () =>
				Response.json(
					{
						error: { code: -32001, message: "Session not found" },
						id: null,
						jsonrpc: "2.0",
					},
					{ status: 404 },
				),
		});
		const response = await relay(
			mcpRequest(
				{ id: 2, jsonrpc: "2.0", method: "tools/list" },
				{ "Mcp-Session-Id": "expired" },
			),
		);
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ error: { message: "Session not found" } });
	});

	it("relays the GET event stream with Last-Event-ID, and passes on 405 when there is none", async () => {
		const upstreams = mockUpstreams({
			amat: (request) =>
				request.headers.get("Mcp-Session-Id") === "abc-123"
					? new Response(
							sse(
								'id: 7\nevent: message\ndata: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}',
							),
							{
								headers: { "Content-Type": "text/event-stream" },
							},
						)
					: new Response(null, { status: 405 }),
		});
		const stream = await relay(
			new Request(RESOURCE, {
				headers: {
					Accept: "text/event-stream",
					"Last-Event-ID": "6",
					"Mcp-Session-Id": "abc-123",
				},
			}),
		);
		expect(stream.status).toBe(200);
		expect(stream.headers.get("Content-Type")).toBe("text/event-stream");
		expect(await stream.text()).toContain("notifications/tools/list_changed");
		expect(upstreams.calls[0].method).toBe("GET");
		expect(upstreams.calls[0].headers.get("Last-Event-ID")).toBe("6");
		expect(upstreams.calls[0].body).toBe("");

		const none = await relay(
			new Request(RESOURCE, { headers: { Accept: "text/event-stream" } }),
		);
		expect(none.status).toBe(405);
	});

	it("streams events as they arrive instead of buffering the response", async () => {
		const encoder = new TextEncoder();
		let push!: (text: string) => void;
		let close!: () => void;
		mockUpstreams({
			amat: () =>
				new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							push = (text) => controller.enqueue(encoder.encode(text));
							close = () => controller.close();
						},
					}),
					{ headers: { "Content-Type": "text/event-stream" } },
				),
		});
		const response = await relay(
			mcpRequest({
				id: 3,
				jsonrpc: "2.0",
				method: "tools/call",
				params: { name: "search_records" },
			}),
		);
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		push(sse('data: {"jsonrpc":"2.0","method":"notifications/progress"}'));
		const first = await reader.read();
		expect(decoder.decode(first.value)).toContain("notifications/progress");

		push(sse('data: {"id":3,"jsonrpc":"2.0","result":{"content":[]}}'));
		close();
		let rest = "";
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			rest += decoder.decode(value);
		}
		expect(rest).toContain('"id":3');
	});

	it("returns only the transport headers of the Amat response", async () => {
		mockUpstreams({
			amat: () =>
				new Response("{}", {
					headers: {
						"Cache-Control": "public, max-age=3600",
						"Content-Type": "application/json",
						"Mcp-Session-Id": "abc-123",
						Server: "nginx/1.24.0 (Ubuntu)",
						"Set-Cookie": "upstream=1",
						"WWW-Authenticate": 'Bearer realm="amat"',
						"X-Powered-By": "uvicorn",
					},
				}),
		});
		const response = await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }));
		expect([...response.headers.keys()].sort()).toEqual([
			"cache-control",
			"content-type",
			"mcp-session-id",
		]);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});
});

describe("Amat failures", () => {
	it.each([301, 302, 303, 307, 308])(
		"refuses a %i redirect without following it",
		async (status) => {
			const upstreams = mockUpstreams({
				amat: () =>
					new Response(null, {
						headers: { Location: "https://evil.example/steal" },
						status,
					}),
			});
			const response = await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }));
			expect(response.status).toBe(502);
			expect(response.headers.get("Location")).toBeNull();
			expect(await response.text()).not.toContain("evil.example");
			expect(upstreams.calls).toHaveLength(1);
		},
	);

	it.each([401, 403])(
		"turns %i from Amat into 502, never into an OAuth challenge",
		async (status) => {
			mockUpstreams({
				amat: () =>
					new Response("<html>401 Authorization Required</html>", {
						headers: { "WWW-Authenticate": "Basic" },
						status,
					}),
			});
			const response = await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }));
			expect(response.status).toBe(502);
			expect(response.headers.get("WWW-Authenticate")).toBeNull();
		},
	);

	it.each([500, 502, 503, 504])("hides the body of a %i from Amat", async (status) => {
		mockUpstreams({
			amat: () => new Response("Traceback: odoo.exceptions.AccessError", { status }),
		});
		const response = await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }));
		expect(response.status).toBe(502);
		const text = await response.text();
		expect(text).not.toContain("Traceback");
		expect(JSON.parse(text)).toMatchObject({ error: { code: -32000 }, jsonrpc: "2.0" });
	});

	it("answers 502 when Amat is unreachable", async () => {
		mockUpstreams({
			amat: () => {
				throw new TypeError("Network connection lost.");
			},
		});
		const response = await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }));
		expect(response.status).toBe(502);
	});

	it("answers 504 when Amat does not answer in time", async () => {
		mockUpstreams({
			amat: (_request, init) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
				}),
		});
		const response = await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }), {
			limits: { requestTimeoutMs: 50 },
		});
		expect(response.status).toBe(504);
	});

	it("closes the GET event stream after the time limit, so the client resumes it", async () => {
		let signal: AbortSignal | null | undefined;
		mockUpstreams({
			amat: (_request, init) => {
				signal = init?.signal;
				// Like a real fetch body, the stream fails when the request's signal aborts.
				// (Wrapping it in `new Response()` would add workerd's own pump in between.)
				const body = new ReadableStream<Uint8Array>({
					start(controller) {
						signal?.addEventListener("abort", () => controller.error(signal!.reason));
					},
				});
				return {
					body,
					headers: new Headers({ "Content-Type": "text/event-stream" }),
					status: 200,
				} as unknown as Response;
			},
		});
		const response = await relay(
			new Request(RESOURCE, { headers: { Accept: "text/event-stream" } }),
			{
				limits: { streamTimeoutMs: 50 },
			},
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
		expect(signal?.aborted).toBe(true);
	});
});

describe("request and response limits", () => {
	it("refuses a body over the limit without contacting Amat", async () => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const big = {
			id: 1,
			jsonrpc: "2.0",
			method: "ping",
			params: { padding: "x".repeat(2000) },
		};
		const response = await relay(mcpRequest(big), { limits: { maxRequestBytes: 1000 } });
		expect(response.status).toBe(413);

		const declared = await relay(
			new Request(RESOURCE, {
				body: "{}",
				headers: { "Content-Length": "999999999", "Content-Type": "application/json" },
				method: "POST",
			}),
		);
		expect(declared.status).toBe(413);
		expect(upstreams.calls).toHaveLength(0);
	});

	it("ends a response at the limit and stops reading from Amat", async () => {
		let cancelled = false;
		const encoder = new TextEncoder();
		mockUpstreams({
			amat: () =>
				new Response(
					new ReadableStream<Uint8Array>({
						pull(controller) {
							controller.enqueue(encoder.encode(`data: ${"x".repeat(600)}\n\n`));
						},
						cancel() {
							cancelled = true;
						},
					}),
					{ headers: { "Content-Type": "text/event-stream" } },
				),
		});
		const response = await relay(
			mcpRequest({
				id: 1,
				jsonrpc: "2.0",
				method: "tools/call",
				params: { name: "read_attachment" },
			}),
			{ limits: { maxResponseBytes: 1000 } },
		);
		const text = await response.text();
		expect(text.length).toBeLessThanOrEqual(1000);
		await vi.waitFor(() => expect(cancelled).toBe(true));
	});

	it.each([
		["text/plain", '{"jsonrpc":"2.0","id":1,"method":"ping"}', 415],
		["application/json", "not json", 400],
		["application/json", '{"id":1,"method":"ping"}', 400],
		["application/json", '{"jsonrpc":"2.0","id":1,"method":42}', 400],
		["application/json", "[]", 400],
		["application/json", "42", 400],
	])("refuses a %s body %j", async (contentType, body, status) => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await relay(
			new Request(RESOURCE, {
				body,
				headers: { "Content-Type": contentType },
				method: "POST",
			}),
		);
		expect(response.status).toBe(status);
		expect(upstreams.calls).toHaveLength(0);
	});

	it("refuses a body that is not UTF-8", async () => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await relay(
			new Request(RESOURCE, {
				body: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
		);
		expect(response.status).toBe(400);
		expect(upstreams.calls).toHaveLength(0);
	});
});

describe("read-only access", () => {
	it("allows only read tools", () => {
		expect([...READ_ONLY_TOOLS].sort()).toEqual([
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
		for (const tool of WRITE_TOOLS) expect(READ_ONLY_TOOLS.has(tool)).toBe(false);
	});

	it.each(WRITE_TOOLS)("answers a call to %s itself, without forwarding it", async (tool) => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await relay(
			mcpRequest({
				id: 9,
				jsonrpc: "2.0",
				method: "tools/call",
				params: { arguments: {}, name: tool },
			}),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { id: number; result: { isError: boolean } };
		expect(body.id).toBe(9);
		expect(body.result.isError).toBe(true);
		expect(upstreams.calls).toHaveLength(0);
	});

	it.each([
		["an unknown tool", { name: "drop_database" }],
		["no tool name", {}],
		["a non-string name", { name: ["create_record"] }],
	])("blocks a tools/call with %s", async (_label, params) => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method: "tools/call", params }));
		expect(upstreams.calls).toHaveLength(0);
	});

	it("refuses a batch that hides a write call among reads", async () => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await relay(
			mcpRequest([
				{ id: 1, jsonrpc: "2.0", method: "tools/call", params: { name: "search_records" } },
				{ id: 2, jsonrpc: "2.0", method: "tools/call", params: { name: "delete_record" } },
			]),
		);
		expect(response.status).toBe(400);
		expect(upstreams.calls).toHaveLength(0);
	});

	it("forwards calls to read tools", async () => {
		const upstreams = mockUpstreams({
			amat: () => Response.json({ id: 1, jsonrpc: "2.0", result: {} }),
		});
		for (const tool of READ_ONLY_TOOLS) {
			await relay(
				mcpRequest({ id: 1, jsonrpc: "2.0", method: "tools/call", params: { name: tool } }),
			);
		}
		expect(upstreams.calls).toHaveLength(READ_ONLY_TOOLS.size);
	});

	it("hides write tools from a JSON tools/list result", async () => {
		mockUpstreams({ amat: () => Response.json(toolsListResult(4)) });
		const response = await relay(mcpRequest({ id: 4, jsonrpc: "2.0", method: "tools/list" }));
		const body = (await response.json()) as ReturnType<typeof toolsListResult>;
		expect(body.result.tools.map((tool) => tool.name)).toEqual([
			"search_records",
			"get_record",
		]);
		expect(body.result.nextCursor).toBe("page-2");
	});

	it("hides write tools from a streamed tools/list result, split across chunks with CRLF", async () => {
		const payload = JSON.stringify(toolsListResult("list-1"));
		const raw = `: ping\r\nevent: message\r\nid: 5\r\ndata: ${payload}\r\n\r\n`;
		const cut = raw.indexOf("\r\n\r\n") + 1; // between the CR and LF of the blank line
		mockUpstreams({
			amat: () =>
				new Response(streamOf([raw.slice(0, 40), raw.slice(40, cut), raw.slice(cut)]), {
					headers: { "Content-Type": "text/event-stream" },
				}),
		});
		const response = await relay(
			mcpRequest({ id: "list-1", jsonrpc: "2.0", method: "tools/list" }),
		);
		const text = await response.text();
		expect(text).toContain(": ping\nevent: message\nid: 5\ndata: ");
		const data = JSON.parse(text.split("data: ")[1]) as ReturnType<typeof toolsListResult>;
		expect(data.result.tools.map((tool) => tool.name)).toEqual([
			"search_records",
			"get_record",
		]);
		expect(text.endsWith("\n\n")).toBe(true);
	});

	it("leaves other streamed events byte for byte", async () => {
		const raw = `event: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/message"}\r\n\r\n`;
		const chunks = [raw, sse(`data: ${JSON.stringify(toolsListResult(99))}`)];
		mockUpstreams({
			amat: () =>
				new Response(streamOf(chunks), {
					headers: { "Content-Type": "text/event-stream" },
				}),
		});
		// id 99 is not the tools/list request of this POST, so it is not touched either.
		const response = await relay(mcpRequest({ id: 4, jsonrpc: "2.0", method: "tools/list" }));
		const text = await response.text();
		expect(text).toContain("notifications/message");
		expect(text).toContain('"create_record"');
	});
});

describe("SSE tools/list filter", () => {
	async function run(chunks: string[], ids: (string | number)[]): Promise<string> {
		const keys = new Set(ids.map((id) => idKey(id)!));
		return new Response(streamOf(chunks).pipeThrough(createSseToolsListFilter(keys))).text();
	}

	it("joins multi-line data before filtering", async () => {
		const json = JSON.stringify(toolsListResult(1), null, 1).split("\n");
		const text = await run([`${json.map((line) => `data: ${line}`).join("\n")}\n\n`], [1]);
		const data = JSON.parse(text.slice("data: ".length)) as ReturnType<typeof toolsListResult>;
		expect(data.result.tools).toHaveLength(2);
	});

	it("handles a lone CR as a line break and an unterminated last event", async () => {
		const text = await run(['event: message\rdata: {"a":1}\r\r', "data: tail"], [1]);
		expect(text).toBe('event: message\ndata: {"a":1}\n\ndata: tail');
	});

	it("keeps string and number ids apart", async () => {
		const text = await run([sse(`data: ${JSON.stringify(toolsListResult(1))}`)], ["1"]);
		expect(text).toContain('"delete_record"');
	});
});

describe("what reaches Amat is what was checked", () => {
	function rawRequest(body: string): Request {
		return new Request(RESOURCE, {
			body,
			headers: {
				Accept: "application/json, text/event-stream",
				"Content-Type": "application/json",
			},
			method: "POST",
		});
	}

	it("answers methods outside the MCP specification itself", async () => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await relay(
			mcpRequest({ id: 7, jsonrpc: "2.0", method: "odoo/execute_kw", params: {} }),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			error: { code: -32601, message: "Method not found" },
			id: 7,
			jsonrpc: "2.0",
		});
		expect(upstreams.calls).toHaveLength(0);
	});

	it("forwards every specified method, notifications and responses", async () => {
		const upstreams = mockUpstreams({ amat: () => new Response(null, { status: 202 }) });
		for (const method of ALLOWED_RPC_METHODS) {
			const params = method === "tools/call" ? { name: "get_record" } : {};
			await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method, params }));
		}
		await relay(mcpRequest({ jsonrpc: "2.0", method: "notifications/cancelled", params: {} }));
		await relay(mcpRequest({ id: "srv-1", jsonrpc: "2.0", result: { roots: [] } }));
		expect(upstreams.calls).toHaveLength(ALLOWED_RPC_METHODS.size + 2);
	});

	it.each([
		['{"name":"create_record","name":"search_records"}', "search_records", 1],
		['{"name":"search_records","name":"create_record"}', null, 0],
	])(
		"reads duplicated keys once and forwards that reading (%s)",
		async (params, forwarded, calls) => {
			const upstreams = mockUpstreams({
				amat: () => Response.json({ id: 1, jsonrpc: "2.0", result: {} }),
			});
			await relay(
				rawRequest(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":${params}}`),
			);
			expect(upstreams.calls).toHaveLength(calls);
			if (forwarded) {
				const { body } = upstreams.calls[0];
				expect(JSON.parse(body).params).toEqual({ name: forwarded });
				expect(body).not.toContain("create_record");
			}
		},
	);

	it.each([
		['{"jsonrpc":"2.0","id":12345678901234567890,"method":"ping"}'],
		[
			'{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_record","arguments":{"id":1e400}}}',
		],
		[
			'{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_record","arguments":{"id":9007199254740993}}}',
		],
	])("refuses numbers JavaScript cannot represent exactly: %s", async (body) => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await relay(rawRequest(body));
		expect(response.status).toBe(400);
		expect(upstreams.calls).toHaveLength(0);
	});

	it("refuses a response that announces more than the limit", async () => {
		let cancelled = false;
		mockUpstreams({
			amat: () =>
				new Response(
					new ReadableStream<Uint8Array>({
						cancel() {
							cancelled = true;
						},
					}),
					{ headers: { "Content-Length": "2000", "Content-Type": "application/json" } },
				),
		});
		const response = await relay(mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }), {
			limits: { maxResponseBytes: 1000 },
		});
		expect(response.status).toBe(502);
		await vi.waitFor(() => expect(cancelled).toBe(true));
	});
});
