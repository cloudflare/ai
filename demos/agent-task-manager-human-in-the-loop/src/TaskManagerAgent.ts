import { Agent } from "agents";
import { generateObject } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";

/**
 * Represents a single task within the system.
 */
interface Task {
	id: string;
	title: string;
	description?: string;
	completed: boolean;
	createdAt: number;
}

/**
 * Represents a confirmation object that waits for human approval
 * before the requested action is actually taken.
 */
interface Confirmation {
	id: string;
	action: "add" | "delete";
	/** Only used for "add" actions. */
	title?: string;
	description?: string;
	/** Only used for "delete" actions. */
	taskId?: string;
}

/**
 * Represents the agent's state, including tasks and pending confirmations.
 */
interface TaskManagerState {
	tasks: Task[];
	confirmations: Confirmation[];
}

export class TaskManagerAgent extends Agent<{ AI: Ai }, TaskManagerState> {
	/**
	 * The initial state of the TaskManagerAgent. By default, there are no tasks and no confirmations.
	 */
	initialState: TaskManagerState = {
		tasks: [],
		confirmations: [],
	};

	/**
	 * Processes a user query and decides whether to add a task, delete a task, list tasks,
	 * or do nothing. Instead of immediately performing add/delete, it creates a Confirmation.
	 */
	async query(
		query: string
	): Promise<
		| { confirmation?: Confirmation; message?: string }
		| Task[]
		| string
		| undefined
	> {
		const workersai = createWorkersAI({ binding: this.env.AI });
		const aiModel = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast");

		// First, determine the desired action: add, delete, list, or none.
		const { object: actionObject } = await generateObject({
			model: aiModel,
			schema: z.object({
				action: z.string(),
				message: z.string().optional(),
			}),
			prompt: `
        You are an intelligent task manager. Based on the user's prompt, decide whether to:
          - "add" a new task,
          - "delete" an existing task,
          - "list" existing tasks,
          - "none" if no action is needed.

        Prompt: "${query}"

        Current tasks: ${JSON.stringify(this.listTasks())}

        Respond with a JSON object structured as follows:

        - To add a task:
          { "action": "add" }

        - To delete a task:
          { "action": "delete" }

        - To list tasks:
          { "action": "list" }

        - To do nothing:
          { "action": "none", "message": "[explanation]" }
      `,
		});

		// If user wants to list tasks, return them immediately.
		if (actionObject.action === "list") {
			return this.listTasks();
		}

		// If user wants no action, just return the provided message (if any).
		if (actionObject.action === "none") {
			return { message: actionObject.message };
		}

		// If user wants to add a task, figure out what the task title should be.
		if (actionObject.action === "add") {
			const { object: addObject } = await generateObject({
				model: aiModel,
				schema: z.object({
					title: z.string().optional(),
				}),
				prompt: `
          You are an intelligent task manager. Extract a title from the user's prompt.

          Prompt: "${query}"

          Respond with a JSON object:

            - If you can extract a title:
              { "title": "[title]" }
            - If not:
              { "title": undefined }
        `,
			});

			if (!addObject.title) {
				return {
					message: "I could not determine a title to add.",
				};
			}

			// Instead of adding immediately, create a Confirmation.
			const newConfirmation: Confirmation = {
				id: crypto.randomUUID(),
				action: "add",
				title: addObject.title,
			};

			// Save the confirmation to the state for future user confirmation.
			this.setState({
				...this.state,
				confirmations: [...this.state.confirmations, newConfirmation],
			});

			return { confirmation: newConfirmation };
		}

		// If user wants to delete a task, figure out which task ID to delete.
		if (actionObject.action === "delete") {
			const { object: deleteObject } = await generateObject({
				model: aiModel,
				schema: z.object({
					taskId: z.string().optional(),
				}),
				prompt: `
          You are an intelligent task manager. The user requested deleting a task.
          Try to figure out which task ID from the list below is the best match.

          Prompt: "${query}"

          Current tasks: ${JSON.stringify(this.listTasks())}

          Respond with a JSON object of the form:
            { "taskId": "[id]" }
          if you find a match, or
            { "taskId": undefined }
          if there is no match.
        `,
			});

			if (!deleteObject.taskId) {
				return {
					message: "No matching task found to delete.",
				};
			}

			// Instead of deleting immediately, create a Confirmation.
			const newConfirmation: Confirmation = {
				id: crypto.randomUUID(),
				action: "delete",
				taskId: deleteObject.taskId,
			};

			this.setState({
				...this.state,
				confirmations: [...this.state.confirmations, newConfirmation],
			});

			return { confirmation: newConfirmation };
		}
	}

	/**
	 * Called by the user (through some external route) to confirm a pending action.
	 * If userConfirmed is true, the action is applied. If false, the confirmation is dropped.
	 *
	 * @param confirmationId - The ID of the Confirmation to confirm or cancel.
	 * @param userConfirmed - Whether to proceed with the action (`true`) or reject it (`false`).
	 * @returns The result of the action that was confirmed, or a message if rejected/not found.
	 */
	confirm(
		confirmationId: string,
		userConfirmed: boolean
	): Task | string | false | undefined {
		// Find the confirmation in the state.
		const confirmation = this.state.confirmations.find(
			(c) => c.id === confirmationId
		);

		if (!confirmation) {
			return "No matching confirmation found.";
		}

		let result: Task | string | false | undefined;

		// If the user actually wants to do the action:
		if (userConfirmed) {
			if (confirmation.action === "add" && confirmation.title) {
				// Replay the add operation.
				result = this.addTask(
					confirmation.title,
					confirmation.description
				);
			} else if (
				confirmation.action === "delete" &&
				confirmation.taskId
			) {
				// Replay the delete operation.
				result = this.deleteTask(confirmation.taskId);
			}
		} else {
			// If user chose not to confirm, simply store a message or handle as needed.
			result = "User chose not to proceed with this action.";
		}

		// Remove the used (or rejected) confirmation from the array.
		const remainingConfirmations = this.state.confirmations.filter(
			(c) => c.id !== confirmationId
		);

		this.setState({
			...this.state,
			confirmations: remainingConfirmations,
		});

		return result;
	}

	/**
	 * Actually adds the task (used internally or upon human confirmation).
	 */
	addTask(title: string, description?: string): Task {
		const newTask: Task = {
			id: crypto.randomUUID(),
			title,
			description,
			completed: false,
			createdAt: Date.now(),
		};

		this.setState({
			...this.state,
			tasks: [...this.state.tasks, newTask],
		});

		return newTask;
	}

	/**
	 * Returns the current list of tasks in the agent's state.
	 */
	listTasks(): Task[] {
		return this.state.tasks;
	}

	/**
	 * Actually deletes the task (used internally or upon human confirmation).
	 * @param taskId - The ID of the task to delete.
	 * @returns The `taskId` that was deleted, `false` if not found.
	 */
	deleteTask(taskId: string): string | false {
		const initialLength = this.state.tasks.length;
		const filteredTasks = this.state.tasks.filter(
			(task) => task.id !== taskId
		);

		if (initialLength === filteredTasks.length) {
			// No task removed, so it was not found.
			return false;
		}

		this.setState({
			...this.state,
			tasks: filteredTasks,
		});

		return taskId;
	}

	/**
	 * Triggered any time the state is updated. Logs a diagnostic message.
	 */
	onStateUpdate(state: TaskManagerState): void {
		console.log("Task manager state updated:", state);
	}
}
