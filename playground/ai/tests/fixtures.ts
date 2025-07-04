import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { test as baseTest } from "@playwright/test";
import { z } from "zod";

function createAddTool(server: McpServer) {
	server.registerTool(
		"add",
		{
			description: "Add two numbers",
			inputSchema: { a: z.number(), b: z.number() },
		},
		async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}),
	);
	server.registerTool(
		"subtract",
		{
			description: "Subtract two numbers",
			inputSchema: { a: z.number(), b: z.number() },
		},
		async ({ a, b }) => ({
			content: [{ type: "text", text: String(a - b) }],
		}),
	);
}

export const test = baseTest.extend<{
	createServer: (
		initializer?: (server: McpServer) => any,
	) => Promise<{ mcpServer: McpServer; url: string }>;
	mcpServerUrl: string;
}>({
	// biome-ignore lint/correctness/noEmptyPattern: playwright requires destructuring
	createServer: async ({}, use) => {
		const servers: http.Server[] = [];

		await use(async (initialize: (server: McpServer) => any = createAddTool) => {
			// Create HTTP server
			const httpServer = http.createServer();
			servers.push(httpServer);

			// Create a new MCP server instance
			const mcpServer = new McpServer({
				name: "test-server",
				version: "1.0.0",
			});

			// Initialize server with tools
			await initialize(mcpServer);

			const transports: Map<string, StreamableHTTPServerTransport> = new Map();

			// Set up request handling
			httpServer.on("request", async (req, res) => {
				res.setHeaders(
					new Headers({
						"access-control-allow-origin": "*",
						"access-control-allow-methods": "GET, POST, OPTIONS",
						"access-control-allow-headers":
							"Content-Type, Authorization, mcp-session-id",
						"access-control-expose-headers": "mcp-session-id",
					}),
				);

				const handlePost = async (req: http.IncomingMessage, res: http.ServerResponse) => {
					// Check for existing session ID
					const sessionId = req.headers["mcp-session-id"] as string | undefined;
					const body = await new Promise<string>((resolve, reject) => {
						let data = "";
						req.on("data", (chunk) => {
							data += chunk.toString();
						});
						req.on("end", () => resolve(JSON.parse(data)));
						req.on("error", reject);
					});

					let transport: StreamableHTTPServerTransport;

					if (sessionId && transports.has(sessionId)) {
						// Reuse existing transport
						transport = transports.get(sessionId)!;
					} else if (!sessionId && isInitializeRequest(body)) {
						// New initialization request
						transport = new StreamableHTTPServerTransport({
							sessionIdGenerator: () => randomUUID(),
							onsessioninitialized: (sessionId) => {
								// Store the transport by session ID
								transports.set(sessionId, transport);
							},
						});

						// Clean up transport when closed
						transport.onclose = () => {
							if (transport.sessionId) {
								transports.delete(transport.sessionId);
							}
						};
						const server = new McpServer({
							name: "example-server",
							version: "1.0.0",
						});

						initialize(server);

						// Connect to the MCP server
						await server.connect(transport);
					} else {
						// Invalid request
						res.writeHead(400, {
							"content-type": "application/json",
						}).end(
							JSON.stringify({
								jsonrpc: "2.0",
								error: {
									code: -32000,
									message: "Bad Request: No valid session ID provided",
								},
								id: null,
							}),
						);
						return;
					}

					await transport.handleRequest(req, res, body);
				};
				httpServer.on("close", () => {
					Promise.all(
						Object.values(transports).map((transport) => transport.close()),
					).catch(() => {});
				});

				switch (`${req.method} ${req.url}`) {
					case "POST /mcp":
						return await handlePost(req, res);
					case "OPTIONS /mcp":
						return res.writeHead(204).end();
					case "GET /mcp":
					case "DELETE /mcp":
						return res.writeHead(405).end("Invalid Method");
					default:
						return res.writeHead(404).end("Not Found");
				}
			});

			// Start server
			await new Promise<void>((resolve) => {
				httpServer.listen(0, "localhost", resolve);
			});

			const address = httpServer.address() as AddressInfo;
			const url = `http://localhost:${address.port}/mcp`;

			return { mcpServer, url };
		});

		// Cleanup servers after tests
		await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
	},

	mcpServerUrl: async ({ createServer }, use) => {
		const { url } = await createServer();
		await use(url);
	},
});
