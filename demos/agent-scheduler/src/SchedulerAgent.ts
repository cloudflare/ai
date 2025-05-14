import { Agent, type Schedule } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { extractActionType } from "./llm/extract-action-type";
import { extractAlarmMessage } from "./llm/extract-alarm-message";
import { extractAlarmType } from "./llm/extract-alarm-type";
import { extractScheduledDate } from "./llm/extract-scheduled-date";
import { extractScheduleId } from "./llm/extract-schedule-id";
import { extractCronSchedule } from "./llm/extract-cron-schedule";

/**
 * Union type representing the different scheduling configurations.
 */
type ConfirmationSchedule =
	| {
			payload: string;
			type: "scheduled";
			date: string;
	  }
	| {
			payload: string;
			type: "delayed";
			time: number;
			delayInSeconds: number;
	  }
	| {
			payload: string;
			type: "cron";
			cron: string;
	  };

/**
 * Union type representing confirmation actions for scheduling operations.
 */
type Confirmation =
	| {
			id: string;
			action: "add";
			schedule: ConfirmationSchedule;
	  }
	| {
			id: string;
			action: "cancel";
			schedule: Schedule;
	  };

/**
 * Interface for the internal state of the SchedulerAgent.
 */
interface SchedulerAgentState {
	confirmations: Confirmation[];
}

/**
 * Agent class specialised in managing scheduling operations.
 */
export class SchedulerAgent extends Agent<{ AI: any }, SchedulerAgentState> {
	/**
	 * Initialises the agent's state with an empty confirmation list.
	 */
	initialState: SchedulerAgentState = {
		confirmations: [],
	};

	/**
	 * Outputs notifications to the console.
	 */
	notify(payload: unknown) {
		console.log(payload);
	}

	/**
	 * Processes user queries and determines the appropriate scheduling action.
	 */
	async query(
		query: string
	): Promise<
		| { confirmation?: Confirmation; message?: string }
		| Schedule[]
		| string
		| undefined
	> {
		const workersai = createWorkersAI({ binding: this.env.AI });
		const aiModel = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast");

		const { action, message } = await extractActionType(
			aiModel,
			query,
			this.getSchedules()
		);

		if (action === "list") {
			return this.getSchedules();
		}

		// Provide feedback if the query does not correspond to any recognised action.
		if (action === "none") {
			return { message };
		}

		if (action === "add") {
			const [payload, scheduleType] = await Promise.all([
				extractAlarmMessage(aiModel, query),
				extractAlarmType(aiModel, query),
			]);

			// We can use the same logic for delayed and schedule as they both refer to a
			// specific time in the future.
			if (scheduleType === "scheduled" || scheduleType === "delayed") {
				const date = await extractScheduledDate(aiModel, query);

				const newConfirmation: Confirmation = {
					id: crypto.randomUUID(),
					action: "add",
					schedule: {
						type: "scheduled",
						date,
						payload,
					},
				};

				this.setState({
					...this.state,
					confirmations: [
						...this.state.confirmations,
						newConfirmation,
					],
				});

				return { confirmation: newConfirmation };
			}

			if (scheduleType === "cron") {
				const cron = await extractCronSchedule(aiModel, query);

				const newConfirmation: Confirmation = {
					id: crypto.randomUUID(),
					action: "add",
					schedule: {
						type: "cron",
						cron,
						payload,
					},
				};

				this.setState({
					...this.state,
					confirmations: [
						...this.state.confirmations,
						newConfirmation,
					],
				});

				return { confirmation: newConfirmation };
			}
		}

		if (action === "cancel") {
			const scheduleId = await extractScheduleId(
				aiModel,
				query,
				this.getSchedules()
			);

			const schedule = scheduleId && (await this.getSchedule(scheduleId));

			if (!schedule) {
				return {
					message: "No matching task found to cancel.",
				};
			}

			const newConfirmation: Confirmation = {
				id: crypto.randomUUID(),
				action: "cancel",
				schedule,
			};

			this.setState({
				...this.state,
				confirmations: [...this.state.confirmations, newConfirmation],
			});

			return { confirmation: newConfirmation };
		}
	}

	/**
	 * Confirms or rejects a pending scheduling operation based on user input.
	 */
	async confirm(
		confirmationId: string,
		userConfirmed: boolean
	): Promise<Schedule | string | false | undefined> {
		const confirmation = this.state.confirmations.find(
			(c) => c.id === confirmationId
		);

		if (!confirmation) {
			return "No matching confirmation found.";
		}

		let result: Schedule | string | false | undefined;

		if (userConfirmed) {
			const { action } = confirmation;
			if (action === "add") {
				const { schedule } = confirmation;
				const { type, payload } = schedule;

				let param: Date | number | string = "";

				switch (type) {
					case "scheduled":
						param = new Date(schedule.date);
						break;
					case "cron":
						param = schedule.cron;
						break;
					case "delayed":
						param = schedule.time;
						break;
					default:
						break;
				}

				result = await this.schedule(param, "notify", payload);
			} else if (action === "cancel") {
				const { schedule } = confirmation;
				await this.cancelSchedule(schedule.id);
				result = schedule;
			}
		} else {
			result = "User chose not to proceed with this action.";
		}

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
	 * Callback triggered upon state updates.
	 */
	onStateUpdate(state: SchedulerAgentState): void {
		console.log("Scheduler Agent state updated:", state);
	}
}
