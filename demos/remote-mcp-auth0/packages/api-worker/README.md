# API Worker

This is the API worker for the remote MCP demo. It is a simple worker which represents an API that is protected by Auth0. This API will offer the capabilities used by the MCP server.

## Development

Create a `.dev.vars` file in the root of the project with the following structure:

```
AUTH0_DOMAIN=mcp-demo.us.auth0.com
AUTH0_AUDIENCE=urn:api-worker
```

The `AUTH0_DOMAIN` is the domain of the Auth0 tenant. The `AUTH0_AUDIENCE` is the audience of the API you created in the Auth0 tenant.

## Testing the API

To test the API, you can use the following command:

```
pnpm run dev
```

This will start the worker and you can make requests to it. You will first need to authenticate with Auth0 and then you will be able to make requests to the API. What you could do for testing is to create an M2M client in the Auth0 dashboard and then use the credentials to get an access token:

```
curl -X POST \
  'https://YOUR_DOMAIN/oauth/token' \
  -H 'content-type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials&client_id=<client_id>&client_secret=<client_secret>&audience=urn:api-worker'
```

Once you have the access token, you can make requests to the API by passing the token in the `Authorization` header:

```bash
curl --request GET \
  --url http://localhost:8788/day_of_week \
  --header 'Authorization: Bearer eyJhbGciO...'
```
