import { Hono } from 'hono'

import { jwt } from './middlewares/jwt'
import type { Variables } from './types/hono'

const app = new Hono<{ Variables: Variables }>()
app.use('*', jwt())

/**
 * GET /day_of_week
 * Returns the current day of the week.
 */
app.get('/day_of_week', async (c) => {
    const payload = c.get('jwtPayload')
    const protectedHeader = c.get('jwtProtectedHeader')

    console.log({
        payload,
        protectedHeader,
    })

    return c.json({
        day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
    })
})

export default app
