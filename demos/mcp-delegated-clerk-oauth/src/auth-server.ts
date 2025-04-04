import { Hono } from "hono";
import { cors } from "hono/cors";

// Define the OAuthConfig interface
interface AuthServerConfig {
	// Full endpoints, does not support paths for now.
	authorizeEndpoint: string;
	tokenEndpoint: string;
	registrationEndpoint?: string;

	scopesSupported?: string[];

	disallowPublicClientRegistration?: boolean;
}

interface ClerkCreateClient {
	object: string;
	id: string;
	instance_id: string;
	name: string;
	client_id: string;
	public: boolean;
	scopes: string;
	redirect_uris: string[];
	callback_url: string;
	authorize_url: string;
	token_fetch_url: string;
	user_info_url: string;
	discovery_url: string;
	token_introspection_url: string;
	created_at: number;
	updated_at: number;
	client_secret?: string;
}

// Basic type validation functions
const validateStringField = (field: any): string | undefined => {
	if (field === undefined) {
		return undefined;
	}
	if (typeof field !== "string") {
		throw new Error("Field must be a string");
	}
	return field;
};

const validateStringArray = (arr: any): string[] | undefined => {
	if (arr === undefined) {
		return undefined;
	}
	if (!Array.isArray(arr)) {
		throw new Error("Field must be an array");
	}

	// Validate all elements are strings
	for (const item of arr) {
		if (typeof item !== "string") {
			throw new Error("All array elements must be strings");
		}
	}

	return arr;
};

// Create a function that returns a configured Hono app
// Create a Hono app
export function creatClerkAuthServer(authServerConfig: AuthServerConfig) {
	const app = new Hono<{ Bindings: Env }>();

	// Configure CORS
	app.use(
		"*",
		cors({
			origin: "*",
			allowHeaders: ["Content-Type", "Authorization"],
			maxAge: 86400,
		}),
	);

	// OAuth metadata discovery endpoint
	app.get("/.well-known/oauth-authorization-server", (c) => {
		return c.json({
			issuer: new URL(authServerConfig.tokenEndpoint).origin,

			authorization_endpoint: authServerConfig.authorizeEndpoint,
			token_endpoint: authServerConfig.tokenEndpoint,
			registration_endpoint: authServerConfig.registrationEndpoint,
			// Reusues token endpoint for revocation for now.
			revocation_endpoint: authServerConfig.tokenEndpoint,

			scopes_supported: authServerConfig.scopesSupported ?? [],

			response_types_supported: ["code"],
			response_modes_supported: ["query"],

			grant_types_supported: ["authorization_code", "refresh_token"],
			token_endpoint_auth_methods_supported: [
				"client_secret_basic",
				"client_secret_post",
				"none",
			],

			// PKCE Support
			code_challenge_methods_supported: ["S256", "plain"],
		});
	});

	// Client registration endpoint
	app.post("/oauth/register", async (c) => {
		// Check content length to ensure it's not too large (1 MiB limit)
		const contentLength = Number.parseInt(c.req.header("Content-Length") || "0", 10);
		if (contentLength > 1048576) {
			// 1 MiB = 1048576 bytes
			return c.json(
				{
					error: "invalid_request",
					error_description: "Request payload too large, must be under 1 MiB",
				},
				413,
			);
		}

		// Parse client metadata with a size limitation
		let clientMetadata: {
			redirect_uris: string[];
			client_name?: string;
			scopesSupported?: string[];
			token_endpoint_auth_method?: string;
		};
		try {
			const text = await c.req.text();
			if (text.length > 1048576) {
				// Double-check text length
				return c.json(
					{
						error: "invalid_request",
						error_description: "Request payload too large, must be under 1 MiB",
					},
					413,
				);
			}
			clientMetadata = JSON.parse(text);
		} catch (error) {
			return c.json(
				{
					error: "invalid_request",
					error_description: "Invalid JSON payload",
				},
				400,
			);
		}

		// Get token endpoint auth method, default to client_secret_basic
		const authMethod =
			validateStringField(clientMetadata.token_endpoint_auth_method) || "client_secret_basic";
		const isPublicClient = authMethod === "none";

		// Check if public client registrations are disallowed
		if (isPublicClient && authServerConfig.disallowPublicClientRegistration) {
			return c.json(
				{
					error: "invalid_client_metadata",
					error_description: "Public client registration is not allowed",
				},
				400,
			);
		}
		let clientBody: {
			redirect_uris: string[];
			name?: string;
			scopes: string;
			public: boolean;
		};
		try {
			// Validate redirect URIs - must exist and have at least one entry
			const redirectUris = validateStringArray(clientMetadata.redirect_uris);

			if (!redirectUris || redirectUris.length === 0) {
				throw new Error("At least one redirect URI is required");
			}

			clientBody = {
				redirect_uris: redirectUris,
				name: validateStringField(clientMetadata.client_name),
				scopes: clientMetadata.scopesSupported?.join(" ") ?? "",
				public: isPublicClient,
			};
		} catch (error) {
			return c.json(
				{
					error: "invalid_client_metadata",
					error_description:
						error instanceof Error ? error.message : "Invalid client metadata",
				},
				400,
			);
		}

		// Create client on Clerk
		const createClientResp = await fetch(`${c.env.CLERK_BACKEND_URL}/oauth_applications`, {
			method: "POST",
			body: JSON.stringify(clientBody),
			headers: {
				Authorization: `Bearer ${c.env.CLERK_SECRET_KEY}`,
				"Content-Type": "application/json",
			},
		});

		if (!createClientResp.ok) {
			return c.json(
				{
					error: "invalid_client_metadata",
				},
				400,
			);
		}

		const createClientBody = (await createClientResp.json()) as ClerkCreateClient;

		// Return client information with the original unhashed secret
		const response: Record<string, any> = {
			client_id: createClientBody.client_id,
			redirect_uris: createClientBody.redirect_uris,
			client_name: createClientBody.name,
			logo_uri: "",
			client_uri: "",
			policy_uri: "",
			tos_uri: "",
			jwks_uri: "",
			contacts: [],
			grant_types: [],
			response_types: [],
			token_endpoint_auth_method: authMethod,
			registration_client_uri: `${authServerConfig.registrationEndpoint}/${createClientBody.client_id}`,
			client_id_issued_at: createClientBody.created_at,
		};

		if (!isPublicClient && !createClientBody.public && !!createClientBody.client_secret) {
			response.client_secret = createClientBody.client_secret;
		}

		return c.json(response, 201);
	});

	return app;
}
