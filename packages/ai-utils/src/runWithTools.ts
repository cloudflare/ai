import { Logger } from "./logger";
import { validateArgsWithZod } from "./utils";
import type { Ai, AiTextGenerationOutput, RoleScopedChatInput } from "@cloudflare/workers-types";
import type { AiTextGenerationToolInputWithFunction } from "./types";

/**
 * Runs a set of tools on a given input and returns the final response in the same format as the AI.run call.
 *
 * @param {Ai} ai - The AI instance to use for the run.
 * @param {keyof AiModels} model - The function calling model to use for the run. We recommend using `@hf/nousresearch/hermes-2-pro-mistral-7b`, `llama-3` or equivalent model that's suited for function calling.
 * @param {Object} input - The input for the runWithTools call.
 * @param {RoleScopedChatInput[]} input.messages - The messages to be sent to the AI.
 * @param {AiTextGenerationToolInputWithFunction[]} input.tools - The tools to be used. You can also pass a function along with each tool that will automatically run the tool with the arguments passed to the function. The function arguments are type-checked against your tool's parameters, so you can get autocomplete and type checking in your IDE.
 * @param {Object} config - Configuration options for the runWithTools call.
 * @param {boolean} [config.streamFinalResponse=false] - Whether to stream the final response or not.
 * @param {number} [config.maxRecursiveToolRuns=0] - The maximum number of recursive tool runs to perform.
 * @param {boolean} [config.strictValidation=false] - Whether to perform strict validation (using zod) of the arguments passed to the tools.
 * @param {boolean} [config.verbose=false] - Whether to enable verbose logging.
 * @param {(tools: AiTextGenerationToolInputWithFunction[], ai: Ai, model: BaseAiTextGenerationModels, messages: RoleScopedChatInput[]) => Promise<AiTextGenerationToolInputWithFunction[]>} [config.trimFunction] - Use a trim function to trim down the number of tools given to the AI for a given task. You can also use this alongside `autoTrimTools`, which uses an extra AI.run call to cut down on the input tokens of the tool call based on the tool's names.
 *
 * @returns {Promise<AiTextGenerationOutput>} The final response in the same format as the AI.run call.
 */
export const runWithTools = async (
	/** The AI instance to use for the run. */
	ai: Ai,
	/** The function calling model to use for the run. We recommend using `@hf/nousresearch/hermes-2-pro-mistral-7b`, `llama-3` or equivalent model that's suited for function calling. */
	model: keyof AiModels,
	/** The input for the runWithTools call. */
	input: {
		/** The messages to be sent to the AI. */
		messages: RoleScopedChatInput[];
		/** The tools to be used. You can also pass a function along with each tool that will Automatically run the tool with the arguments passed to the function. The function arguments are type-checked against your tool's parameters, so you can get autocomplete and type checking in your IDE. */
		tools: AiTextGenerationToolInputWithFunction[];
	},
	/** Configuration options for the runWithTools call. */
	config: {
		/** Whether to stream the final response or not. */
		streamFinalResponse?: boolean;
		/** The maximum number of recursive tool runs to perform. */
		maxRecursiveToolRuns?: number;
		/** Whether to perform strict validation (using zod) of the arguments passed to the tools. */
		strictValidation?: boolean;
		/** Whether to enable verbose logging. */
		verbose?: boolean;

		/** Automatically decides the best tools to use for a given task. */
		trimFunction?: (
			tools: AiTextGenerationToolInputWithFunction[],
			ai: Ai,
			model: keyof AiModels,
			messages: RoleScopedChatInput[],
		) => Promise<AiTextGenerationToolInputWithFunction[]>;
	} = {},
): Promise<AiTextGenerationOutput> => {
	// Destructure config with default values
	const {
		streamFinalResponse = false,
		maxRecursiveToolRuns = 0,
		verbose = false,
		trimFunction = async (
			tools: AiTextGenerationToolInputWithFunction[],
			_ai: Ai,
			_model: keyof AiModels,
			_messages: RoleScopedChatInput[],
		) => tools as AiTextGenerationToolInputWithFunction[],
		strictValidation = false,
	} = config;

	// Enable verbose logging if specified in the config
	if (verbose) {
		Logger.enableLogging();
	}

	// Remove functions from the tools for initial processing
	const initialtoolsWithoutFunctions = input.tools.map(
		({ function: _function, ...rest }) => rest,
	);

	// Transform tools to include only the function definitions
	let tools = initialtoolsWithoutFunctions.map((tool) => ({
		type: "function" as const,
		function: { ...tool, function: undefined },
	}));

	let tool_calls: { name: string; arguments: unknown }[] = [];
	let totalCharacters = 0;

	// Creating a copy of the input object to avoid mutating the original object
	const messages = [...input.messages];

	// If trimFunction is enabled, choose the best tools for the task
	if (trimFunction) {
		const chosenTools = await trimFunction(input.tools, ai, model, messages);
		tools = chosenTools.map((tool) => ({
			type: "function",
			function: { ...tool, function: undefined },
		}));
	}

	// Recursive function to process responses and execute tools
	async function runAndProcessToolCall({
		ai,
		model,
		messages,
		streamFinalResponse,
		maxRecursiveToolRuns,
	}: {
		ai: Ai;
		model: keyof AiModels;
		messages: RoleScopedChatInput[];
		streamFinalResponse: boolean;
		maxRecursiveToolRuns: number;
	}): Promise<AiTextGenerationOutput> {
		try {
			Logger.info("Starting AI.run call");
			Logger.info("Messages", JSON.stringify(messages, null, 2));

			Logger.info(`Only using ${input.tools.length} tools`);

			const response = (await ai.run(model, {
				messages: messages,
				stream: false,
				tools: tools,
			})) as {
				response?: string;
				tool_calls?: {
					name: string;
					arguments: unknown;
				}[];
			};

			const chars =
				JSON.stringify(messages).length +
				JSON.stringify(initialtoolsWithoutFunctions).length;
			totalCharacters += chars;
			Logger.info(`Number of characters for the first AI.run call: ${totalCharacters}`);

			Logger.info("AI.run call completed", response);

			tool_calls = response.tool_calls?.filter(Boolean) ?? [];

			const toolCallPromises = tool_calls.map(async (toolCall) => {
				const toolCallObjectJson = toolCall;

				messages.push({
					role: "assistant",
					content: JSON.stringify(toolCallObjectJson),
				});

				const selectedTool = input.tools.find(
					(tool) => tool.name === toolCallObjectJson.name,
				);

				if (!selectedTool) {
					Logger.error(
						`Tool ${toolCallObjectJson.name} not found, maybe AI hallucinated`,
					);
					return; // Or handle the error accordingly
				}

				const fn = selectedTool.function;

				if (fn !== undefined && selectedTool.parameters !== undefined) {
					const args = toolCallObjectJson.arguments;

					// Validate arguments if strict validation is enabled
					if (
						strictValidation &&
						!validateArgsWithZod(args, selectedTool.parameters.properties as any)
					) {
						Logger.error(
							`Invalid arguments for tool ${selectedTool.name}: ${JSON.stringify(args)}`,
						);
						return; // Or handle the error accordingly
					}

					try {
						Logger.info(`Executing tool ${selectedTool.name} with arguments`, args);
						const result = await fn(args);

						Logger.info(`Tool ${selectedTool.name} execution result`, result);

						messages.push({
							role: "tool",
							content: JSON.stringify(result),
							name: selectedTool.name,
						});
					} catch (error) {
						Logger.error(`Error executing tool ${selectedTool.name}:`, error);
						messages.push({
							role: "tool",
							content: `Error executing tool ${selectedTool.name}: ${(error as Error).message}`,
							name: selectedTool.name,
						});
					}
				} else {
					Logger.error(`Function for tool ${toolCallObjectJson.name} is undefined`);
					return response;
				}
			});

			await Promise.all(toolCallPromises);

			// Recursively call the runAndProcessToolCall if maxRecursiveToolRuns is not reached
			if (maxRecursiveToolRuns > 0 && tool_calls.length > 0) {
				maxRecursiveToolRuns--;
				return await runAndProcessToolCall({
					ai,
					model,
					messages,
					streamFinalResponse,
					maxRecursiveToolRuns,
				});
			}
			Logger.info("Max recursive tool runs reached, generating final response");

			const finalResponse = await ai.run(model, {
				messages: messages,
				stream: streamFinalResponse,
			});
			totalCharacters += JSON.stringify(messages).length;
			Logger.info(
				`Number of characters for the final AI.run call: ${JSON.stringify(messages).length}`,
			);

			Logger.info(`Total number of characters: ${totalCharacters}`);
			return finalResponse as AiTextGenerationOutput;
		} catch (error) {
			Logger.error("Error in runAndProcessToolCall:", error);
			throw new Error(`Error in runAndProcessToolCall: ${(error as Error).message}`);
		}
	}

	try {
		Logger.info("Starting runWithTools process");
		const result = await runAndProcessToolCall({
			ai,
			model,
			messages,
			streamFinalResponse,
			maxRecursiveToolRuns,
		});
		Logger.info("runWithTools process completed");
		return result;
	} catch (error) {
		Logger.error("Error in runWithTools:", error);
		throw new Error(`Error in runWithTools: ${(error as Error).message}`);
	}
};
