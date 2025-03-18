// Route: Approve (POST)
import { html } from 'hono/html'
import { layout } from '../utils'
import app from './_app'
import { AuthRequest } from '../lib/OAuthProvider'

app.post('/approve', async (c) => {
  const body = await c.req.parseBody()
  const action = body.action as string
  const randomString = body.randomString as string
  const email = body.email as string

  console.log('Approval route called:', {
    action,
    isLoggedIn: c.get('isLoggedIn'),
    body,
  })

  let message: string
  let status: string
  let redirectUrl: string

  if (action === 'approve' || action === 'login_approve') {
    message = 'Authorization approved!'
    status = 'success'

    const oauthReqInfo = await c.env.OAUTH_KV.get<AuthRequest>(`login:${randomString}`, { type: 'json' })
    console.log({ oauthReqInfo2: oauthReqInfo })
    if (!oauthReqInfo) {
      return c.html('INVALID LOGIN')
    }

    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: email,
      metadata: {
        label: 'Test User',
      },
      scope: oauthReqInfo.scope,
      props: {
        userEmail: email,
      },
    })
    redirectUrl = redirectTo
  } else {
    message = 'Authorization rejected.'
    status = 'error'
    redirectUrl = '/'
  }

  const content = html`
    <div class="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md text-center">
      <div class="mb-4">
        <span class="inline-block p-3 ${status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} rounded-full">
          ${status === 'success' ? '✓' : '✗'}
        </span>
      </div>
      <h1 class="text-2xl font-heading font-bold mb-4 text-gray-900">${message}</h1>
      <p class="mb-8 text-gray-600">You will be redirected back to the application shortly.</p>
      <a href="/" class="inline-block py-2 px-4 bg-primary text-white rounded-md font-medium hover:bg-primary/90 transition-colors">
        Return to Home
      </a>
      <script>
        setTimeout(() => {
          window.location.href = '${redirectUrl}'
        }, 2000)
      </script>
    </div>
  `

  return c.html(layout(content, 'MCP Remote Auth Demo - Authorization Status', c.get('isLoggedIn')))
})
