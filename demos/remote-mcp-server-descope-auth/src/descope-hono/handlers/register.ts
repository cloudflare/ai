import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  OAuthClientInformationFullSchema,
  OAuthClientMetadata,
  OAuthClientMetadataSchema,
} from "../schemas/oauth.js";
import {
  InvalidClientMetadataError,
  InvalidRequestError,
  ServerError,
  OAuthError,
} from "../errors.js";
import { allowedMethods } from "../middleware/allowedMethods.js";
import { DescopeMcpProvider } from "../provider.js";
import {
  DescopeErrorResponse,
  DescopeErrorResponseSchema,
} from "../schemas/descope.js";

function formatDescopeError(
  status: number,
  errorBody: DescopeErrorResponse,
): string {
  const { errorDescription, errorCode } = errorBody;
  return `${status}${errorDescription ? ` - ${errorDescription}` : ""}${errorCode ? ` (${errorCode})` : ""}`;
}

export function registrationHandler(
  provider: DescopeMcpProvider,
): Hono {
  const app = new Hono();

  // Configure CORS to allow any origin, to make accessible to web-based MCP clients
  app.use("*", cors());

  app.use("*", allowedMethods(["POST"]));

  app.post("/", async (c) => {
    c.header("Cache-Control", "no-store");

    try {
      const body = await c.req.json();
      if (!body || typeof body !== "object") {
        throw new InvalidRequestError("Request body must be a JSON object");
      }

      const parseResult = OAuthClientMetadataSchema.safeParse(body);
      if (!parseResult.success) {
        throw new InvalidClientMetadataError(parseResult.error.message);
      }

      const clientMetadata = parseResult.data;
      const clientInfo = await registerClient(clientMetadata, provider);
      
      return c.json(clientInfo, 201);
    } catch (error) {
      if (error instanceof OAuthError) {
        const status = error instanceof ServerError ? 500 : 400;
        return c.json(error.toResponseObject(), status);
      } else {
        console.error("Unexpected error registering client:", error);
        const serverError = new ServerError("Internal Server Error");
        return c.json(serverError.toResponseObject(), 500);
      }
    }
  });

  return app;
}

async function registerClient(
  client: OAuthClientMetadata,
  provider: DescopeMcpProvider,
) {
  const { client_name, redirect_uris, logo_uri } = client;

  const createAppResponse = await fetch(
    `${provider.baseUrl}/v1/mgmt/thirdparty/app/create`,
    {
      headers: {
        Authorization: `Bearer ${provider.projectId}:${provider.managementKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        name: client_name,
        approvedCallbackUrls: redirect_uris,
        logo: logo_uri,
        loginPageUrl:
          provider.options.dynamicClientRegistrationOptions?.authPageUrl,
        permissionsScopes:
          provider.options.dynamicClientRegistrationOptions?.permissionScopes?.map(
            ({ name, description, required, roles }) => ({
              name,
              description,
              optional: required !== true,
              values: roles,
            }),
          ),
        attributesScopes:
          provider.options.dynamicClientRegistrationOptions?.attributeScopes?.map(
            ({ name, description, required, attributes }) => ({
              name,
              description,
              optional: required !== true,
              values: attributes,
            }),
          ),
      }),
    },
  );

  if (!createAppResponse.ok) {
    const parsedError = DescopeErrorResponseSchema.parse(
      await createAppResponse.json().catch(() => ({})),
    );
    throw new ServerError(
      `Failed to create app: ${formatDescopeError(createAppResponse.status, parsedError)}`,
    );
  }

  type CreateAppResponse = {
    id: string;
    cleartext: string;
  };

  const createAppResponseJson =
    (await createAppResponse.json()) as CreateAppResponse;
  const appId = createAppResponseJson.id;

  const loadAppResponse = await fetch(
    `${provider.baseUrl}/v1/mgmt/thirdparty/app/load?id=${appId}`,
    {
      headers: {
        Authorization: `Bearer ${provider.projectId}:${provider.managementKey}`,
      },
      method: "GET",
    },
  );

  if (!loadAppResponse.ok) {
    const parsedError = DescopeErrorResponseSchema.parse(
      await loadAppResponse.json().catch(() => ({})),
    );
    throw new ServerError(
      `Failed to load app: ${formatDescopeError(loadAppResponse.status, parsedError)}`,
    );
  }

  type LoadAppResponse = {
    clientId: string;
  };

  const loadAppResponseJson = (await loadAppResponse.json()) as LoadAppResponse;
  const client_id = loadAppResponseJson.clientId;

  return OAuthClientInformationFullSchema.parse({
    client_id,
    ...client,
  });
}
