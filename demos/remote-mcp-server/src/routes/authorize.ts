// Route: Register/OAuth
import { html } from 'hono/html'
import { layout } from '../utils'
import app from './_app'

app.get('/authorize', async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw)
  const randomString = crypto.randomUUID()
  console.log({ oauthReqInfo, randomString })
  let value = JSON.stringify(oauthReqInfo)
  console.log({ value })
  await c.env.OAUTH_KV.put(`login:${randomString}`, value, { expirationTtl: 600 })

  const isLoggedIn = c.get('isLoggedIn')

  const oauthScopes = [
    { name: 'read_profile', description: 'Read your basic profile information' },
    { name: 'read_data', description: 'Access your stored data' },
    { name: 'write_data', description: 'Create and modify your data' },
  ]

  const content = html`
    <div class="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md">
      <h1 class="text-2xl font-heading font-bold mb-6 text-gray-900">Authorization Request</h1>

      <div class="mb-8">
        <h2 class="text-lg font-semibold mb-3 text-gray-800">MCP Remote Auth Demo would like permission to:</h2>
        <ul class="space-y-2">
          ${oauthScopes.map(
            (scope) => html`
              <li class="flex items-start">
                <span class="inline-block mr-2 mt-1 text-secondary">✓</span>
                <div>
                  <p class="font-medium">${scope.name}</p>
                  <p class="text-gray-600 text-sm">${scope.description}</p>
                </div>
              </li>
            `,
          )}
        </ul>
      </div>

      <form action="/approve" method="POST" class="space-y-4">
        <input type="hidden" name="randomString" value="${randomString}" />
        ${isLoggedIn
          ? html`
              <input type="hidden" name="email" value="user@example.com" />
              <button
                type="submit"
                name="action"
                value="approve"
                class="w-full py-3 px-4 bg-secondary text-white rounded-md font-medium hover:bg-secondary/90 transition-colors"
              >
                Approve
              </button>
              <button
                type="submit"
                name="action"
                value="reject"
                class="w-full py-3 px-4 border border-gray-300 text-gray-700 rounded-md font-medium hover:bg-gray-50 transition-colors"
              >
                Reject
              </button>
            `
          : html`
              <div class="space-y-4">
                <div>
                  <label for="email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                </div>
                <div>
                  <label for="password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    required
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                </div>
              </div>
              <button
                type="submit"
                name="action"
                value="login_approve"
                class="w-full py-3 px-4 bg-primary text-white rounded-md font-medium hover:bg-primary/90 transition-colors"
              >
                Log in and Approve
              </button>
              <button
                type="submit"
                name="action"
                value="reject"
                class="w-full py-3 px-4 border border-gray-300 text-gray-700 rounded-md font-medium hover:bg-gray-50 transition-colors"
              >
                Reject
              </button>
            `}
      </form>
    </div>
  `

  return c.html(layout(await content, 'MCP Remote Auth Demo - Authorization', isLoggedIn))
})
