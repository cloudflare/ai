import { Hono } from 'hono';
import { authenticationMiddleware, requireScopeMiddleware } from './auth';
import { getScopedTodoService } from './todoService';
import { type Env, type APIVariables, TODO_READ_SCOPE, TODO_WRITE_SCOPE } from './config';

const api = new Hono<{ Bindings: Env, Variables: APIVariables }>();
api.use(authenticationMiddleware);

api.get('/api/todos',
  requireScopeMiddleware(TODO_READ_SCOPE),
  async (c) => {
    const todos = await getScopedTodoService(c.var.USER_ID).get(c.env);
    return c.json({ todos });
  },
);

api.post('/api/todos',
  requireScopeMiddleware(TODO_WRITE_SCOPE),
  async (c) => {
    const newTodo = await c.req.json<{ todoText: string }>();
    const todos = await getScopedTodoService(c.var.USER_ID).add(c.env, newTodo.todoText);
    return c.json({ todos });
  },
);

api.patch('/api/todos/:id',
  requireScopeMiddleware(TODO_WRITE_SCOPE),
  async (c) => {
    const { completed } = await c.req.json<{ completed: boolean }>();
    const todos = await getScopedTodoService(c.var.USER_ID).toggle(c.env, c.req.param().id, completed);
    return c.json({ todos });
  },
);

api.delete('/api/todos/:id',
  requireScopeMiddleware(TODO_WRITE_SCOPE),
  async (c) => {
    const todos = await getScopedTodoService(c.var.USER_ID).delete(c.env, c.req.param().id);
    return c.json({ todos });
  },
);

export default api;
