import { env } from 'cloudflare:workers';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
};

class TodoService {
  constructor(private userID: string) {};

  // Persists data to KV, sorted for consistency
  #set = async (todos: Todo[]): Promise<Todo[]> => {
    const sorted = todos.sort((t1, t2) => {
      if (t1.completed === t2.completed) {
        return t1.id.localeCompare(t2.id);
      };
      return t1.completed ? 1 : -1;
    });
    await env.TODO_KV_NAMESPACE.put(this.userID, JSON.stringify(sorted));
    return sorted;
  };

  get = async (): Promise<Todo[]> => {
    const todos = await env.TODO_KV_NAMESPACE.get<Todo[]>(this.userID, 'json');
    return todos || [];
  };

  add = async (todoText: string): Promise<Todo[]> => {
    const todos = await this.get();
    const newTodo: Todo = {
      id: Date.now().toString(),
      text: todoText,
      completed: false
    };
    todos.push(newTodo);
    return this.#set(todos);
  };

  delete = async (todoID: string): Promise<Todo[]> => {
    const todos = await this.get();
    const cleaned = todos.filter(t => t.id !== todoID);
    return this.#set(cleaned);
  };

  toggle = async (todoID: string, completed: boolean): Promise<Todo[]> => {
    const todos = await this.get();
    const todoToUpdate = todos.find(t => t.id === todoID);
    if (todoToUpdate) {
      todoToUpdate.completed = completed;
      return this.#set(todos);
    };
    return todos;
  };
};

/**
 * Creates a new, user-scoped TodoService instance.
 * @param userID The user-specific key for KV storage.
 */
export const getScopedTodoService = (userID: string) => new TodoService(userID);
