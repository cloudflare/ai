import YAML from "yaml";
import type { OpenAPIV3 } from "./types/openapi-schema";
import type { JSONSchema7 } from "json-schema";
import { type ZodTypeAny, z } from "zod";
import { Logger } from "./logger";
import type { AiTextGenerationToolInputWithFunction } from "./types";
import type { Ai, RoleScopedChatInput } from "@cloudflare/workers-types";

export async function fetchSpec(spec: string): Promise<OpenAPIV3.Document | undefined> {
	try {
		return JSON.parse(spec);
	} catch (jsonErr) {
		console.error("Failed to parse JSON, trying YAML...");
	}

	try {
		// Try parsing as YAML
		const yamlDoc = YAML.parse(spec);
		if (yamlDoc !== null && typeof yamlDoc === "object") {
			return yamlDoc as OpenAPIV3.Document;
		}
	} catch (yamlErr) {
		console.error("Failed to parse YAML.");
	}

	try {
		// If it's not JSON or YAML or cannot be parsed, attempt to fetch it
		const response = await fetch(spec);
		if (!response.ok) {
			console.error(
				`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`,
			);
			return;
		}
		return await fetchSpec(await response.text());
	} catch (fetchErr) {
		console.error("Failed to fetch OpenAPI spec:", (fetchErr as Error).message);
		return;
	}
}

function convertToZodSchema(schema: any): ZodTypeAny {
	switch (schema.type) {
		case "string":
			return z.string();
		case "number":
			return z.number();
		case "integer":
			return z.number().int();
		case "boolean":
			return z.boolean();
		case "array":
			return z.array(convertToZodSchema(schema.items));
		case "object": {
			const properties: Record<string, ZodTypeAny> = {};
			for (const key in schema.properties) {
				properties[key] = convertToZodSchema(schema.properties[key]);
			}
			return z.object(properties);
		}
		default:
			throw new Error(`Unsupported schema type: ${schema.type}`);
	}
}

export function validateArgsWithZod(args: any, properties: Record<string, JSONSchema7>): boolean {
	const zodSchema: Record<string, ZodTypeAny> = {};
	for (const key in properties) {
		zodSchema[key] = convertToZodSchema(properties[key]);
	}

	const schema = z.object(zodSchema);

	try {
		schema.parse(args);
		Logger.info("Validation passed");
		return true;
	} catch (e) {
		Logger.error("Validation failed:", (e as Error).message);
		return false;
	}
}

export async function autoTrimTools(
	tools: AiTextGenerationToolInputWithFunction[],
	ai: Ai,
	model: keyof AiModels,
	messages: RoleScopedChatInput[],
) {
	let returnedTools = tools;
	if (tools.length < 5) {
		Logger.error("autoTrimTools is only supported for tasks with more than 4 tools");
	} else {
		const chooseTools = {
			name: "chooseTool",
			description: "This tool will choose the best tools for a given task",
			parameters: {
				// we need to do 'as const' for now because the types don't expect a `string`
				type: "object" as const,
				properties: {
					tools: {
						type: "array",
						items: {
							type: "string",
						},
					},
				},
				required: ["tools"],
			},
		};

		const toolsPrompt = `For the following prompt, please find the best tool names that will be suitable to complete some tasks. For this, you must run the "chooseTool" tool. \nHere are the available tool names to choose from: ${tools.map((tool) => tool.name).join(", ")}. \nHere are the messages: \n\n${JSON.stringify(messages)}.`;

		const toolsResponse = (await ai.run(model as unknown as keyof AiModels, {
			messages: [
				{
					role: "user",
					content: toolsPrompt,
				},
			],
			stream: false,
			tools: [{ type: "function", function: chooseTools }],
		})) as {
			response?: string;
			tool_calls?: {
				// For now, I couldn't find a reliable way to remove the ReadableStream type from the union.
				name: string;
				arguments: {
					tools: string[];
				};
			}[];
		};

		// Filter the chosen tool calls from the response
		const chooseToolCalls = toolsResponse.tool_calls?.filter(Boolean);

		if (chooseToolCalls && chooseToolCalls.length > 0) {
			const tools = chooseToolCalls[0].arguments.tools;
			Logger.info("Chosen tools", tools);

			if (Array.isArray(tools)) {
				returnedTools = returnedTools.filter((tool) => tools.includes(tool.name));
			}
		}
	}

	return returnedTools;
}
