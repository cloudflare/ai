import type { Env } from './config';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
};

class TodoService {
  constructor(private userID: string) {};

  // Persists data to KV, sorted for consistency
  #set = async (env: Env, todos: Todo[]): Promise<Todo[]> => {
    const sorted = todos.sort((t1, t2) => {
      if (t1.completed === t2.completed) {
        return t1.id.localeCompare(t2.id);
      };
      return t1.completed ? 1 : -1;
    });
    await env.TODO_KV_PING_FEDERATE.put(this.userID, JSON.stringify(sorted));
    return sorted;
  };

  get = async (env: Env): Promise<Todo[]> => {
    const todos = await env.TODO_KV_PING_FEDERATE.get<Todo[]>(this.userID, 'json');
    return todos || [];
  };

  add = async (env: Env, todoText: string): Promise<Todo[]> => {
    const todos = await this.get(env);
    const newTodo: Todo = {
      id: Date.now().toString(),
      text: todoText,
      completed: false
    };
    todos.push(newTodo);
    return this.#set(env, todos);
  };

  delete = async (env: Env, todoID: string): Promise<Todo[]> => {
    const todos = await this.get(env);
    const cleaned = todos.filter(t => t.id !== todoID);
    return this.#set(env, cleaned);
  };

  toggle = async (env: Env, todoID: string, completed: boolean): Promise<Todo[]> => {
    const todos = await this.get(env);
    const todoToUpdate = todos.find(t => t.id === todoID);
    if (todoToUpdate) {
      todoToUpdate.completed = completed;
      return this.#set(env, todos);
    };
    return todos;
  };
};

/**
 * Creates a new, user-scoped TodoService instance.
 * @param userID The user-specific key for KV storage.
 */
export const getScopedTodoService = (userID: string) => new TodoService(userID);
