import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { DurableMCP } from "workers-mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WebClient } from "@slack/web-api";
import { SlackHandler } from "./slack-handler";

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
type Props = {
  userId: string;
  userName: string;
  teamId: string;
  teamName: string;
  accessToken: string;
  scope: string;
};

// To restrict access to specific users only, add their Slack userIDs to this Set.
// Leave it empty to allow access to all authenticated users.
const ALLOWED_USERIDS = new Set([
  // Example: 'U01234567',
]);

export class SlackMCP extends DurableMCP<Props, Env> {
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
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            userId: this.props.userId,
            userName: this.props.userName,
            teamName: this.props.teamName,
            scope: this.props.scope
          }) 
        }],
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
          types: "public_channel"
        });

        return { 
          content: [{ 
            type: "text", 
            text: JSON.stringify(response.channels, null, 2) 
          }] 
        };
      }
    );

    // Get channel messages tool
    this.server.tool(
      "getChannelMessages",
      "Get recent messages from a specific channel",
      {
        channelId: z.string().describe("The Slack channel ID"),
        limit: z.number().min(1).max(100).default(10).describe("Number of messages to retrieve")
      },
      async ({ channelId, limit }) => {
        const slack = new WebClient(this.props.accessToken);
        const response = await slack.conversations.history({
          channel: channelId,
          limit
        });

        return { 
          content: [{ 
            type: "text", 
            text: JSON.stringify(response.messages, null, 2) 
          }] 
        };
      }
    );

    // Get daily update tool
    this.server.tool(
      "getDailyUpdate",
      "Get a daily summary of important Slack messages",
      {},
      async () => {
        const slack = new WebClient(this.props.accessToken);

        // Get list of channels
        const channelsResponse = await slack.conversations.list({
          exclude_archived: true,
          types: "public_channel",
          limit: 10
        });

        const channels = channelsResponse.channels || [];
        let allMessages = [];

        // Get messages from each channel (limited to 5 for this demo)
        for (const channel of channels.slice(0, 5)) {
          if (channel.id) {
            const messagesResponse = await slack.conversations.history({
              channel: channel.id,
              limit: 10
            });

            if (messagesResponse.messages && messagesResponse.messages.length > 0) {
              allMessages.push({
                channelName: channel.name,
                channelId: channel.id,
                messages: messagesResponse.messages
              });
            }
          }
        }

        return {
          content: [{
            type: "text",
            text: `# Daily Slack Update for ${this.props.userName}\n\n` +
                  `Team: ${this.props.teamName}\n\n` +
                  allMessages.map(channel => 
                    `## Channel: ${channel.channelName}\n\n` +
                    channel.messages.map(msg => 
                      `- ${msg.user || "User"}: ${msg.text || "No text"}\n`
                    ).join("")
                  ).join("\n\n")
          }]
        };
      }
    );

    // This tool will fail because we only requested read permissions
    this.server.tool(
      "postMessage",
      "Attempt to post a message to a channel (will fail due to read-only permissions)",
      {
        channelId: z.string().describe("The Slack channel ID"),
        message: z.string().describe("The message to post")
      },
      async ({ channelId, message }) => {
        const slack = new WebClient(this.props.accessToken);

        try {
          const response = await slack.chat.postMessage({
            channel: channelId,
            text: message
          });

          return {
            content: [{
              type: "text",
              text: "Message posted successfully! This should not happen with read-only permissions."
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to post message as expected with read-only permissions: ${error.message || JSON.stringify(error)}\n\nThis demonstrates that the MCP has properly limited access to read-only operations.`
            }]
          };
        }
      }
    );
  }
}

export default new OAuthProvider({
  apiRoute: "/sse",
  apiHandler: SlackMCP.mount("/sse"),
  defaultHandler: SlackHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  kvStore: { binding: "OAUTH_KV" }
});