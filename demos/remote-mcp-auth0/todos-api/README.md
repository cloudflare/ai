# Todos API

This is a sample API which is protected by Auth0. It is used in the remote MCP demo to showcase the capabilities how the MCP server can be used to call a protected API on behalf of a user.

> Note: While for this demo we are deploying the API to Cloudflare, it could be deployed anywhere.

## Auth0 Configuration

In the Auth0 dashboard, create a new API in the APIs section.

<img src="../docs/create-api.jpg" width="500" alt="Create API">

Once the API is created, enable "Offline Access" so we can get a refresh token.

<img src="../docs/offline-access.jpg" width="500" alt="Enable Offline Access">

> Note: You can turn off the "Allow Skipping User Consent" if you want to force users to consent to the scopes.

And finally add the following API permissions:

- `read:todos`
- `read:billing`

<img src="../docs/create-permissions.jpg" width="500" alt="Create Permissions">

That's it! You can now configure your local environment or deploy the API to Cloudflare.

## Development

Create a `.dev.vars` file in the root of the project with the following structure:

```
AUTH0_DOMAIN=yourtenant.us.auth0.com
AUTH0_AUDIENCE=urn:todos-api
```

The `AUTH0_DOMAIN` is the domain of the Auth0 tenant. The `AUTH0_AUDIENCE` is the audience of the API you created in the Auth0 tenant (eg: `urn:todos-api`).

### Testing the API

To test the API, you can use the following command:

```
npm run dev
```

This will start the worker and you can make requests to it. In the Auth0 dashboard there is a **Test** tab in the API where you can get an `access_token` to call the API. Use this to call the API as follows:

```bash
curl --request GET \
  --url http://localhost:8788/api/me \
  --header 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6Im...'
```

If this call is successful, you should see the claims of the JWT token in the response.

## Deploying the API

To deploy the API to Cloudflare, you will first need to set the following secrets:

```bash
wrangler secret put AUTH0_DOMAIN
wrangler secret put AUTH0_AUDIENCE
```

Once the secrets are set, you can deploy the API with the following command:

```bash
npm run deploy
```
