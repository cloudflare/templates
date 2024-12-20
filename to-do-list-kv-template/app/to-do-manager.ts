interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

export class TodoManager {
  constructor(
    private kv: KVNamespace,
    private todosKey: string = "todos",
  ) {}

  async list(): Promise<Todo[]> {
    const todos = await this.kv.get(this.todosKey, "json");
    if (Array.isArray(todos)) {
      todos.sort((a: Todo, b: Todo) => b.createdAt - a.createdAt);
    }
    return (todos || []) as Todo[];
  }

  async create(text: string): Promise<Todo> {
    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      createdAt: Date.now(),
    };
    const todos = await this.list();
    todos.push(newTodo);
    await this.kv.put(this.todosKey, JSON.stringify(todos), {
      expirationTtl: 300,
    });
    return newTodo;
  }

  async toggle(id: string): Promise<Todo> {
    const todos = await this.list();
    const todoIndex = todos.findIndex((todo) => todo.id === id);
    if (todoIndex === -1) {
      throw new Error(`Todo with id ${id} not found`);
    }
    todos[todoIndex].completed = !todos[todoIndex].completed;
    await this.kv.put(this.todosKey, JSON.stringify(todos), {
      expirationTtl: 300,
    });
    return todos[todoIndex];
  }

  async delete(id: string): Promise<void> {
    const todos = await this.list();
    const newTodos = todos.filter((todo) => todo.id !== id);
    await this.kv.put(this.todosKey, JSON.stringify(newTodos), {
      expirationTtl: 300,
    });
  }
}
