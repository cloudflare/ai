import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Client } from "@microsoft/microsoft-graph-client";
import { z } from "zod";
import { EntraHandler } from "./entra-handler";

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
type Props = {
	userPrincipalName: string;
	displayName: string;
	mail: string;
	id: string;
	accessToken: string;
};

export class EntraIdMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Microsoft Entra ID OAuth MCP Server",
		version: "1.0.0",
	});

	async init() {
		// Simple test tool
		this.server.tool(
			"add",
			"Add two numbers",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ text: String(a + b), type: "text" }],
			}),
		);

		// Get current user profile
		this.server.tool(
			"getUserProfile",
			"Get the authenticated user's profile from Microsoft Graph",
			{},
			async () => {
				const client = Client.init({
					authProvider: (done) => {
						done(null, this.props!.accessToken);
					},
				});

				try {
					const user = await client.api("/me").get();
					return {
						content: [
							{
								text: JSON.stringify(user, null, 2),
								type: "text",
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								text: `Error fetching user profile: ${error instanceof Error ? error.message : String(error)}`,
								type: "text",
							},
						],
						isError: true,
					};
				}
			},
		);

		// Search for people
		this.server.tool(
			"searchPeople",
			"Search for people in your organization using Microsoft Graph Users API. Returns display name and email address for each person found. Use this before scheduling meetings to find attendee email addresses.",
			{
				query: z.string().describe("Search query for finding people by name (e.g., 'Megan Bowen', 'John', 'Smith')"),
			},
			async ({ query }) => {
				const client = Client.init({
					authProvider: (done) => {
						done(null, this.props!.accessToken);
					},
				});

				try {
					// Use $search parameter on /users endpoint for better search capabilities
					const users = await client
						.api("/users")
						.header("ConsistencyLevel", "eventual")
						.count(true)
						.search(`"displayName:${query}"`)
						.orderby("displayName")
						.select("id,displayName,mail,jobTitle,department")
						.get();

					// Format the response to be more useful for scheduling
					if (users.value && users.value.length > 0) {
						const formatted = users.value.map((person: any) => ({
							displayName: person.displayName,
							email: person.mail || "No email found",
							jobTitle: person.jobTitle || "",
							department: person.department || "",
						}));

						return {
							content: [
								{
									text: `Found ${formatted.length} person(s):\n\n${JSON.stringify(formatted, null, 2)}\n\nTo schedule a meeting, use the email address with createCalendarEvent tool.`,
									type: "text",
								},
							],
						};
					} else {
						return {
							content: [
								{
									text: `No people found matching "${query}". Try searching with a different name or check the spelling.`,
									type: "text",
								},
							],
						};
					}
				} catch (error) {
					return {
						content: [
							{
								text: `Error searching people: ${error instanceof Error ? error.message : String(error)}. Make sure User.Read.All permission is granted.`,
								type: "text",
							},
						],
						isError: true,
					};
				}
			},
		);

		// List users (requires User.Read.All)
		this.server.tool(
			"listUsers",
			"List users in the organization (requires User.Read.All permission)",
			{
				top: z.number().optional().default(10).describe("Number of users to return"),
			},
			async ({ top }) => {
				const client = Client.init({
					authProvider: (done) => {
						done(null, this.props!.accessToken);
					},
				});

				try {
					const users = await client.api("/users").top(top).get();

					return {
						content: [
							{
								text: JSON.stringify(users, null, 2),
								type: "text",
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								text: `Error listing users: ${error instanceof Error ? error.message : String(error)}. Make sure User.Read.All permission is granted.`,
								type: "text",
							},
						],
						isError: true,
					};
				}
			},
		);
	}
}

export default new OAuthProvider({
	// NOTE - during the summer 2025, the SSE protocol was deprecated and replaced by the Streamable-HTTP protocol
	// https://developers.cloudflare.com/agents/model-context-protocol/transport/#mcp-server-with-authentication
	apiHandlers: {
		"/sse": EntraIdMCP.serveSSE("/sse"), // deprecated SSE protocol - use /mcp instead
		"/mcp": EntraIdMCP.serve("/mcp"), // Streamable-HTTP protocol
	},
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: EntraHandler as any,
	tokenEndpoint: "/token",
});
