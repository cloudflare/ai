import { Agent } from "agents";
import { generateObject } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";

interface Task {
	id: string;
	title: string;
	description?: string;
	completed: boolean;
	createdAt: number;
}

interface TaskManagerState {
	tasks: Task[];
}

export class TaskManagerAgent extends Agent<{ AI: Ai }, TaskManagerState> {
	initialState: TaskManagerState = {
		tasks: [],
	};

	async query(
		query: string
	): Promise<
		{ message?: string } | Task | Task[] | boolean | string | undefined
	> {
		const workersai = createWorkersAI({ binding: this.env.AI });
		const aiModel = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast");

		const { object } = await generateObject({
			model: aiModel,
			schema: z.object({
				action: z.string(),
				message: z.string().optional(),
			}),
			prompt: `
				You are an intelligent task manager. Based on the user's prompt, determine whether to:
				- "add" a new task,
				- "delete" an existing task,
				- "list" existing tasks
				- "none" - do nothing, e.g. if the task already exists

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
				  { "action": "none", message: "[the reason why you are doing nothing]" }
			`,
		});

		if (object.action === "add") {
			const { object } = await generateObject({
				model: aiModel,
				schema: z.object({
					title: z.string().optional(),
				}),
				prompt: `
				  You are an intelligent task manager. Your mission is to extract a title for the task that is described in the user prompt.

				  Prompt: "${query}"

				  Respond with a JSON object structured as follows:

					- If you are able to extract a task title from the user prompt:
					  { "title": "[the title for the task]" }

					- If you are not able to extract a task title from the user prompt:
					  { "title": undefined }
				`,
			});

			if (!object.title) {
				return {
					message:
						"Was not able to extract a title from the provided prompt.",
				};
			}

			return this.addTask(object.title);
		}

		if (object.action === "delete") {
			const { object } = await generateObject({
				model: aiModel,
				schema: z.object({
					taskId: z.string().optional(),
				}),
				prompt: `
				You are an intelligent task manager. You have have a user prompt that is asking you to delete a task.
				Please review the user prompt to determine which task to delete. You will be given a list of tasks.

					Prompt: "${query}"

					Current tasks: ${JSON.stringify(this.listTasks())}

					Respond with a JSON object structured as follows:

					- If there is a matching task in the list of current tasks:
					  { "taskId": "[the id of the matching task]" }

					- If there is no matching task in the list of current tasks:
					  { "taskId": undefined }
				`,
			});

			if (object.taskId) {
				return this.deleteTask(object.taskId);
			}

			return false;
		}

		if (object.action === "list") {
			return this.listTasks();
		}

		return object.message;
	}

	addTask(title: string, description?: string): Task {
		const newTask: Task = {
			id: crypto.randomUUID(),
			title,
			description,
			completed: false,
			createdAt: Date.now(),
		};

		this.setState({
			tasks: [...this.state.tasks, newTask],
		});

		return newTask;
	}

	listTasks(): Task[] {
		return this.state.tasks;
	}

	deleteTask(taskId: string): string | false {
		const initialLength = this.state.tasks.length;
		const filteredTasks = this.state.tasks.filter(
			(task) => task.id !== taskId
		);

		if (initialLength === filteredTasks.length) {
			return false; // Task not found
		}

		this.setState({
			tasks: filteredTasks,
		});

		return taskId;
	}

	onStateUpdate(state: TaskManagerState): void {
		console.log("Task manager state updated:", state);
	}
}
