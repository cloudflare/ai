# OAuth 2.1 Provider Framework for Cloudflare Workers

This is a TypeScript library that implements the provider side of the OAuth 2.1 protocol with PKCE support. The library is intended to be used on Cloudflare Workers.

## Benefits of this library

* The library acts as a wrapper around your Worker code, which adds authorization for your API endpoints.
* All token management is handled automatically.
* Your API handler is written like a regular fetch handler, but receives the already-authenticated user details as a parameter. No need to perform any checks of your own.
* The library is agnostic to how you manage and authenticate users.
* The library is agnostic to how you build your UI. Your authorization flow can be implemented using whatever UI framework you use for everything else.
* The library's storage does not store any secrets, only hashes of them.

## Usage

A Worker that uses the library might look like this:

```ts
import { OAuthProvider } from "my-oauth";
import type { ExportedHandler } from "@cloudflare/workers-types";
import { WorkerEntrypoint } from "cloudflare:workers";

// We export the OAuthProvider instance as the entrypoint to our Worker. This means it
// implements the `fetch()` handler, receiving all HTTP requests.
export default new OAuthProvider({
  // Configure API routes. Any requests whose URL starts with any of these prefixes will be
  // considered API requests. The OAuth provider will check the access token on these requests,
  // and then, if the token is valid, send the request to the API handler.
  // You can provide:
  // - A single route (string) or multiple routes (array)
  // - Full URLs (which will match the hostname) or just paths (which will match any hostname)
  apiRoute: [
    "/api/", // Path only - will match any hostname
    "https://api.example.com/" // Full URL - will check hostname
  ],

  // When the OAuth system receives an API request with a valid access token, it passes the request
  // to this handler object's fetch method.
  // You can provide either an object with a fetch method (ExportedHandler)
  // or a class extending WorkerEntrypoint.
  apiHandler: ApiHandler, // Using a WorkerEntrypoint class

  // Any requests which aren't API request will be passed to the default handler instead.
  // Again, this can be either an object or a WorkerEntrypoint.
  defaultHandler: defaultHandler, // Using an object with a fetch method

  // This specifies the URL of the OAuth authorization flow UI. This UI is NOT implemented by
  // the OAuthProvider. It is up to the application to implement a UI here. The only reason why
  // this URL is given to the OAuthProvider is so that it can implement the RFC-8414 metadata
  // discovery endpoint, i.e. `.well-known/oauth-authorization-server`.
  // Can also be specified as just a path (e.g., "/authorize").
  authorizeEndpoint: "https://example.com/authorize",

  // This specifies the OAuth 2 token exchange endpoint. The OAuthProvider will implement this
  // endpoint (by directly responding to requests with a matching URL).
  // Can also be specified as just a path (e.g., "/oauth/token").
  tokenEndpoint: "https://example.com/oauth/token",

  // This specifies the RFC-7591 dynamic client registration endpoint. This setting is optional,
  // but if provided, the OAuthProvider will implement this endpoint to allow dynamic client
  // registration.
  // Can also be specified as just a path (e.g., "/oauth/register").
  clientRegistrationEndpoint: "https://example.com/oauth/register",

  // Optional list of scopes supported by this OAuth provider.
  // If provided, this will be included in the RFC 8414 metadata as 'scopes_supported'.
  // If not provided, the 'scopes_supported' field will be omitted from the metadata.
  scopesSupported: ["document.read", "document.write", "profile"],
  
  // Optional: Controls whether the OAuth implicit flow is allowed.
  // The implicit flow is discouraged in OAuth 2.1 but may be needed for some clients.
  // Defaults to false.
  allowImplicitFlow: false,
  
  // Optional: Controls whether public clients (clients without a secret, like SPAs) 
  // can register via the dynamic client registration endpoint.
  // When true, only confidential clients can register.
  // Note: Creating public clients via the OAuthHelpers.createClient() method 
  // is always allowed regardless of this setting.
  // Defaults to false.
  disallowPublicClientRegistration: false
});

// The default handler object - the OAuthProvider will pass through HTTP requests to this object's fetch method
// if they aren't API requests or do not have a valid access token
const defaultHandler = {
  // This fetch method works just like a standard Cloudflare Workers fetch handler
  //
  // The `request`, `env`, and `ctx` parameters are the same as for a normal Cloudflare Workers fetch
  // handler, and are exactly the objects that the `OAuthProvider` itself received from the Workers
  // runtime.
  //
  // The `env.OAUTH_PROVIDER` provides an API by which the application can call back to the
  // OAuthProvider.
  async fetch(request: Request, env, ctx) {
    let url = new URL(request.url);

    if (url.pathname == "/authorize") {
      // This is a request for our OAuth authorization flow UI. It is up to the application to
      // implement this. However, the OAuthProvider library provides some helpers to assist.

      // `env.OAUTH_PROVIDER.parseAuthRequest()` parses the OAuth authorization request to extract the parameters
      // required by the OAuth 2 standard, namely response_type, client_id, redirect_uri, scope, and
      // state. It returns an object containing all these (using idiomatic camelCase naming).
      let oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);

      // `env.OAUTH_PROVIDER.lookupClient()` looks up metadata about the client, as definetd by RFC-7591. This
      // includes things like redirect_uris, client_name, logo_uri, etc.
      let clientInfo = await env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);

      // At this point, the application should use `oauthReqInfo` and `clientInfo` to render an
      // authorization consent UI to the user. The details of this are up to the app so are not
      // shown here.

      // After the user has granted consent, the application calls `env.OAUTH_PROVIDER.completeAuthorization()` to
      // grant the authorization.
      let {redirectTo} = await env.OAUTH_PROVIDER.completeAuthorization({
        // The application passes back the original OAuth request info that was returned by
        // `parseAuthRequest()` earlier.
        request: oauthReqInfo,

        // The application must specify the user's ID, which is some sort of string. This is needed
        // so that the application can later query the OAuthProvider to enumerate all grants
        // belonging to a particular user, e.g. to implement an audit and revocation UI.
        userId: "1234",

        // The application can specify some arbitary metadata which describes this grant. The
        // metadata can contain any JSON-serializable content. This metadata is not used by the
        // OAuthProvider, but the application can read back the metadata attached to specific
        // grants when enumerating them later, again e.g. to implement an udit and revocation UI.
        metadata: {label: "foo"},

        // The application specifies the list of OAuth scope identifiers that were granted. This
        // may or may not be the same as was requested in `oauthReqInfo.scope`.
        scope: ["document.read", "document.write"],

        // `props` is an arbitrary JSON-serializable object which will be passed back to the API
        // handler for every request authorized by this grant.
        props: {
          userId: 1234,
          username: "Bob"
        }
      });

      // `completeAuthorization()` will have returned the URL to which the user should be redirected
      // in order to complete the authorization flow. This is the requesting client's OAuth
      // redirect_uri with the appropriate query parameters added to complete the flow and obtain
      // tokens.
      return Response.redirect(redirectTo, 302);
    }

    // ... the application can implement other non-API HTTP endpoints here ...

    return new Response("Not found", {status: 404});
  }
};

// The API handler object - the OAuthProivder will pass authorized API requests to this object's fetch method
// (because we provided it as the `apiHandler` setting, above). This is ONLY called for API requests
// that had a valid access token.
class ApiHandler extends WorkerEntrypoint {
  // This fetch method works just like any other WorkerEntrypoint fetch method. The `request` is
  // passed as a parameter, while `env` and `ctx` are available as `this.env` and `this.ctx`.
  //
  // The `this.env.OAUTH_PROVIDER` is available just like in the default handler.
  //
  // The `this.ctx.props` property contains the `props` value that was passed to
  // `env.OAUTH_PROVIDER.completeAuthorization()` during the authorization flow that authorized this client.
  fetch(request: Request) {
    // The application can implement its API endpoints like normal. This app implements a single
    // endpoint, `/api/whoami`, which returns the user's authenticated identity.

    let url = new URL(request.url);
    if (url.pathname == "/api/whoami") {
      // Since the username is embedded in `ctx.props`, which came from the access token that the
      // OAuthProivder already verified, we don't need to do any other authentication steps.
      return new Response(`You are authenticated as: ${this.ctx.props.username}`);
    }

    return new Response("Not found", {status: 404});
  }
};
```

This implementation requires that your worker is configured with a Workers KV namespace binding called `OAUTH_KV`, which is used to store token information. See the file `storage-schema.md` for details on the schema of this namespace.

The `env.OAUTH_PROVIDER` object available to the fetch handlers provides some methods to query the storage, including:

* Create, list, modify, and delete client_id registrations (in addition to `lookupClient()`, already shown in the example code).
* List all active authorization grants for a particular user.
* Revoke (delete) an authorization grant.

See the `OAuthHelpers` interface definition for full API details.

## Written by Claude

This library (including the schema documentation) was largely written by Claude, the AI model by Anthropic. Check out the commit history to see how Claude was prompted and what code it produced.

## Implementation Notes

### Single-use refresh tokens?

OAuth 2.1 requires that refresh tokens are either "cryptographically bound" to the client, or are single-use. This library currently does not implement any cryptographic binding, thus seemingly requiring single-use tokens. Under this requirement, every token refresh request invalidates the old refresh token and issues a new one.

This requirement is seemingly fundamentally flawed as it assumes that every refresh request will complete with no errors. In the real world, a transient network error, machine failure, or software fault could mean that the client fails to store the new refresh token after a refresh request. In this case, the client would be permanently unable to make any further requests, as the only token it has is no longer valid.

This library implements a compromise: At any particular time, a grant may have two valid refresh tokens. When the client uses one of them, the other one is invalidated, and a new one is generated and returned. Thus, if the client correctly uses the new refresh token each time, then older refresh tokens are continuously invalidated. But if a transient failure prevents the client from updating its token, it can always retry the request with the token it used previously.
