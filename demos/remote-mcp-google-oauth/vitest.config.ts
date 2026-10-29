import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Tests run inside workerd with the bindings from wrangler.jsonc. The values below replace
// the production placeholders and stand in for the secrets; none of them is a real credential.
export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				bindings: {
					AMAT_ACCESS_TOKEN: "test-amat-shared-secret",
					AMAT_MCP_URL: "https://mcp-amat.nasta-univers.com/mcp",
					GOOGLE_CLIENT_ID: "test-google-client-id",
					GOOGLE_CLIENT_SECRET: "test-google-client-secret",
					MCP_RESOURCE: "http://localhost:8788/mcp",
				},
			},
		}),
	],
});
