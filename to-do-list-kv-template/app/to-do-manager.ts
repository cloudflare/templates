interface Todo {
	id: string;
	text: string;
	completed: boolean;
	createdAt: number;
}

/**
 * TodoManager handles all interactions with the Todos KV store.
 * This class provides CRUD operations for managing todo items in Cloudflare KV storage.
 *
 * By separating all of the logic for interacting with the KV store from the
 * rest of the Remix application, we can easily test the logic in isolation
 * using [Cloudflare's vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
 */
export class TodoManager {
	/**
	 * Creates a new TodoManager instance
	 * @param kv - The Cloudflare KV namespace instance to use for storage
	 * @param todosKey - The key under which todos will be stored in KV (defaults to "todos")
	 */
	constructor(
		private kv: KVNamespace,
		private todosKey: string = "todos",
	) {}

	/**
	 * Retrieves all todos from storage
	 * @returns Promise containing an array of Todo items, sorted by creation date (newest first)
	 */
	async list(): Promise<Todo[]> {
		const todos = await this.kv.get(this.todosKey, "json");
		if (Array.isArray(todos)) {
			todos.sort((a: Todo, b: Todo) => b.createdAt - a.createdAt);
		}
		return (todos || []) as Todo[];
	}

	/**
	 * Creates a new todo item
	 * @param text - The text content of the todo item
	 * @returns Promise containing the newly created Todo item
	 */
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

	/**
	 * Toggles the completed status of a todo item
	 * @param id - The unique identifier of the todo item to toggle
	 * @returns Promise containing the updated Todo item
	 * @throws Error if the todo item with the specified ID is not found
	 */
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

	/**
	 * Deletes a todo item
	 * @param id - The unique identifier of the todo item to delete
	 * @returns Promise that resolves when the deletion is complete
	 */
	async delete(id: string): Promise<void> {
		const todos = await this.list();
		const newTodos = todos.filter((todo) => todo.id !== id);
		await this.kv.put(this.todosKey, JSON.stringify(newTodos), {
			expirationTtl: 300,
		});
	}
}
