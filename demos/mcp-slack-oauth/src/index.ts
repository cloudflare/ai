import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WebClient } from "@slack/web-api";
import { type Props, refreshSlackToken, SlackHandler } from "./slack-handler";

// To restrict access to specific users only, add their Slack userIDs to this Set.
// Leave it empty to allow access to all authenticated users.
const ALLOWED_USERIDS = new Set([
	// Example: 'U01234567',
]);

export class SlackMCP extends McpAgent<Env, unknown, Props> {
	server = new McpServer({
		name: "Slack Assistant MCP",
		version: "1.0.0",
	});

	async init() {
		// Who am I tool
		this.server.tool(
			"whoami",
			"Get information about your Slack user",
			{},
			async () => ({
				content: [
					{
						type: "text",
						text: JSON.stringify({
							userId: this.props.userId,
							userName: this.props.userName,
							teamName: this.props.teamName,
							scope: this.props.scope,
						}),
					},
				],
			}),
		);

		// List channels tool
		this.server.tool(
			"listChannels",
			"Get a list of channels from your Slack workspace",
			{},
			async () => {
				const slack = new WebClient(this.props.accessToken);
				const response = await slack.conversations.list({
					exclude_archived: true,
					types: "public_channel",
				});

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(response.channels, null, 2),
						},
					],
				};
			},
		);

		// Get channel messages tool
		this.server.tool(
			"getChannelMessages",
			"Get recent messages from a specific channel",
			{
				channelId: z.string().describe("The Slack channel ID"),
				limit: z
					.number()
					.min(1)
					.max(100)
					.default(10)
					.describe("Number of messages to retrieve"),
			},
			async ({ channelId, limit }) => {
				const slack = new WebClient(this.props.accessToken);
				const response = await slack.conversations.history({
					channel: channelId,
					limit,
				});

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(response.messages, null, 2),
						},
					],
				};
			},
		);

		// This tool will fail because we only requested read permissions
		this.server.tool(
			"postMessage",
			"Attempt to post a message to a channel (will fail due to read-only permissions)",
			{
				channelId: z.string().describe("The Slack channel ID"),
				message: z.string().describe("The message to post"),
			},
			async ({ channelId, message }) => {
				const slack = new WebClient(this.props.accessToken);

				try {
					const response = await slack.chat.postMessage({
						channel: channelId,
						text: message,
					});

					return {
						content: [
							{
								type: "text",
								text: "Message posted successfully! This should not happen with read-only permissions.",
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to post message as expected with read-only permissions: ${(error as Error).message || JSON.stringify(error)}\n\nThis demonstrates that the MCP has properly limited access to read-only operations.`,
							},
						],
					};
				}
			},
		);
	}
}

export default new OAuthProvider({
	apiRoute: "/sse",
	apiHandler: SlackMCP.mount("/sse") as any,
	defaultHandler: SlackHandler as any,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
	tokenExchangeCallback: async (options) => {
		if (options.grantType === "refresh_token") {
			// Some Slack OAuth tokens don't expire, in which case we won't get a refreshToken,
			// and there's nothing to do here.
			if (!options.props.refreshToken) return;

			// Keep most of the existing props, but override whatever needs changing
			return {
				newProps: {
					...options.props,
					...(await refreshSlackToken(options.props.refreshToken)),
				},
			};
		}
	},
});
