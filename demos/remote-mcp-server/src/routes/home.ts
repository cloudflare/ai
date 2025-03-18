// Homepage content as Markdown
import app from './_app'
import { html } from 'hono/html'
import { marked } from 'marked'
import { layout } from '../utils'

const homeMarkdown = `
# Welcome to MCP Remote Auth Demo

A professional, cheerful platform for all your needs.

## What We Offer

Our platform provides seamless integration with various services while maintaining the highest standards of security and user experience.

We believe in simplicity and efficiency. [Learn more](/about) about our philosophy or [register now](/register) to get started.

> "The best way to predict the future is to create it." — Peter Drucker
`

// Route: Homepage
app.get('/', async (c) => {
  const isLoggedIn = c.get('isLoggedIn')
  // @ts-ignore
  const content = html` <div class="max-w-4xl mx-auto markdown">${html([await marked(homeMarkdown)])}</div> `
  return c.html(layout(await content, 'MCP Remote Auth Demo - Home', isLoggedIn))
})
