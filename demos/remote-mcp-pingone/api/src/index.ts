import { Hono } from 'hono';
import { requireJwtMiddleware } from './auth';
import { getScopedTodoService } from './todoService';
import type { Env, APIVariables } from './config';

const api = new Hono<{ Bindings: Env, Variables: APIVariables }>();
api.use(requireJwtMiddleware);

api.get('/api/todos', async (c) => {
  const todos = await getScopedTodoService(c.var.USER_ID).get();
  return c.json({ todos });
});

api.post('/api/todos', async (c) => {
  const newTodo = await c.req.json<{ todoText: string }>();
  const todos = await getScopedTodoService(c.var.USER_ID).add(newTodo.todoText);
  return c.json({ todos });
});

api.patch('/api/todos/:id', async (c) => {
  const { completed } = await c.req.json<{ completed: boolean }>();
  const todos = await getScopedTodoService(c.var.USER_ID).toggle(c.req.param().id, completed);
  return c.json({ todos });
});

api.delete('/api/todos/:id', async (c) => {
  const todos = await getScopedTodoService(c.var.USER_ID).delete(c.req.param().id);
  return c.json({ todos });
});

export default api;
