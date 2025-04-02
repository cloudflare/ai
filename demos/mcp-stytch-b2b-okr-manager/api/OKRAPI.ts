import {Hono} from "hono";
import {okrService} from "./OKRService.ts";
import {stytchSessionAuthMiddleware} from "./lib/auth";

/**
 * The Hono app exposes the OKR Service via REST endpoints for consumption by the frontend
 */
export const OKRAPI = new Hono<{ Bindings: Env }>()

    .get('/objectives', stytchSessionAuthMiddleware({resource_id: 'objective', action: 'read'}), async (c) => {
        const objectives = await okrService(c.env, c.var.organizationID).get()
        return c.json({objectives});
    })

    .post('/objectives', stytchSessionAuthMiddleware({resource_id: 'objective', action: 'create'}), async (c) => {
        const newObjective = await c.req.json<{ objectiveText: string }>();
        const objectives = await okrService(c.env, c.var.organizationID).addObjective(newObjective.objectiveText)
        return c.json({objectives});
    })

    .delete('/objectives/:okrID', stytchSessionAuthMiddleware({resource_id: 'objective', action: 'delete'}), async (c) => {
        const objectives = await okrService(c.env, c.var.organizationID).deleteObjective(c.req.param().okrID)
        return c.json({objectives});
    })

    .post('/objectives/:okrID/keyresults', stytchSessionAuthMiddleware({resource_id: 'key_result', action: 'create'}), async (c) => {
        const newKeyResult = await c.req.json<{ keyResultText: string }>();
        const objectives = await okrService(c.env, c.var.organizationID).addKeyResult(c.req.param().okrID, newKeyResult.keyResultText)
        return c.json({objectives});
    })

    .post('/objectives/:okrID/keyresults/:krID/attainment', stytchSessionAuthMiddleware({resource_id: 'key_result', action: 'update'}), async (c) => {
        const newAttainment = await c.req.json<{ attainment: number }>();
        const objectives = await okrService(c.env, c.var.organizationID).setKeyResultAttainment(c.req.param().okrID, c.req.param().krID, newAttainment.attainment)
        return c.json({objectives});
    })

    .delete('/objectives/:okrID/keyresults/:krID', stytchSessionAuthMiddleware({resource_id: 'key_result', action: 'delete'}), async (c) => {
        const objectives = await okrService(c.env, c.var.organizationID).deleteKeyResult(c.req.param().okrID, c.req.param().krID)
        return c.json({objectives});
    })

export type OKRApp = typeof OKRAPI;