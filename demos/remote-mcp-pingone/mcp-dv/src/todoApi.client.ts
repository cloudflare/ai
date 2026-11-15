interface Todo {
  id: string;
  text: string;
  completed: boolean;
};

interface TodoListResponse {
  todos: Todo[];
};

export class TodoApiClient {
  private baseUrl: string;

  constructor(API_URL: string ) {
    this.baseUrl = API_URL;
  };

  private async callApi(path: string, token: string, method: string, body?: object): Promise<TodoListResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Error calling Todo API', errorBody)
      throw new Error(`API request failure: ${response.status}`);
    };
    return response.json() as Promise<TodoListResponse>;
  };

  public async getTodos(token: string): Promise<Todo[]> {
    const r = await this.callApi('/api/todos', token, 'GET');
    return r.todos;
  };

  public async addTodo(token: string, text: string): Promise<Todo[]> {
    const r = await this.callApi('/api/todos', token, 'POST', { todoText: text });
    return r.todos;
  };

  public async toggleTodo(token: string, todoId: string, completed: boolean): Promise<Todo[]> {
    const r = await this.callApi(`/api/todos/${todoId}`, token, 'PATCH', { completed: completed });
    return r.todos;
  };

  public async deleteTodo(token: string, todoId: string): Promise<Todo[]> {
    const r = await this.callApi(`/api/todos/${todoId}`, token, 'DELETE');
    return r.todos;
  };
};
