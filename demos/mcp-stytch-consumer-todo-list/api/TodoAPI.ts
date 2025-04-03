import {Hono} from "hono";
import {todoService} from "./TodoService.ts";
import {stytchSessionAuthMiddleware} from "./lib/auth";


/**
 * The Hono app exposes the TODO Service via REST endpoints for consumption by the frontend
 */
export const TodoAPI = new Hono<{ Bindings: Env }>()

    .get('/todos', stytchSessionAuthMiddleware, async (c) => {
        const todos = await todoService(c.env, c.var.userID).get()
        return c.json({todos})
    })

    .post('/todos', stytchSessionAuthMiddleware, async (c) => {
        const newTodo = await c.req.json<{ todoText: string }>();
        const todos = await todoService(c.env, c.var.userID).add(newTodo.todoText)
        return c.json({todos})
    })

    .post('/todos/:id/complete', stytchSessionAuthMiddleware, async (c) => {
        const todos = await todoService(c.env, c.var.userID).markCompleted(c.req.param().id)
        return c.json({todos})
    })

    .delete('/todos/:id', stytchSessionAuthMiddleware, async (c) => {
        const todos = await todoService(c.env, c.var.userID).delete(c.req.param().id)
        return c.json({todos})
    })

export type TodoApp = typeof TodoAPI;