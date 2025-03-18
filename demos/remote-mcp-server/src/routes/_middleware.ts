import app from './_app'

// Middleware to check login status (placeholder using random)
app.use('*', async (c, next) => {
  const isLoggedIn = Math.random() > 0.5
  c.set('isLoggedIn', isLoggedIn)
  await next()
})
