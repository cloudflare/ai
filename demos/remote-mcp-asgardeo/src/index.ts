import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AsgardeoHandler, tokenExchangeCallback } from "./asgardeo-handler";
import { Props } from "./types";

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
export class MyMCP extends McpAgent<Env, {}, Props> {
  server = new McpServer({
    name: "Asgardeo OAuth Proxy Demo",
    version: "1.0.0",
  });

  async init() {
    const userClaims = getUserClaims(this.props.claimSet);
    const roles: string[] = userClaims.roles;
    console.log("User roles:", roles);

    this.server.tool(
      "userInfo",
      "Get user info from your user profile",
      {},
      async () => {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await userClaims),
            },
          ],
        };
      }
    );

    // Check the user's roles and add tools accordingly
    if (isManager(roles)) {
      this.server.tool(
        "getDirectReportees",
        "Get names of your direct reportees",
        {},
        async () => {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(getDirectReportees()),
              },
            ],
          };
        }
      );
    }
  }
}

function isManager(roles?: string[] | null): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return false;
  return roles.includes("manager");
}

// Helper function to remove all OIDC meta claims from claimSet
function getUserClaims(claimSet: Record<string, any>) {
  const OIDC_CLAIMS = [
    "iss", "aud", "exp", "iat", "auth_time", "nonce", "acr", "amr", "azp", "sub",
    "at_hash", "c_hash", "isk", "sid", "org_id", "org_handle", "nbf", "jti"
  ];
  return Object.fromEntries(
    Object.entries(claimSet).filter(([key]) => !OIDC_CLAIMS.includes(key))
  );
}

// Function to return dummy data 
function getDirectReportees() {
  return [
    { name: "Ian Rose", position: "Software Engineer" },
    { name: "Ira Clay", position: "Software Manager" },
    { name: "Zoe Green", position: "QA Manager" }
  ];
}

export default new OAuthProvider({
  apiRoute: "/sse",
  apiHandler: MyMCP.mount("/sse") as any,
  defaultHandler: AsgardeoHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  tokenExchangeCallback: tokenExchangeCallback
});
