import type { AiTextGenerationToolInput } from "@cloudflare/workers-types";
import type { JSONSchema7 } from "json-schema";

export type UppercaseHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";
export type LowercaseHttpMethod = "get" | "post" | "put" | "patch" | "delete" | "options" | "head";

export type HttpMethod = UppercaseHttpMethod | LowercaseHttpMethod;

export interface Parameter {
	name: string;
	required: boolean;
	type: string;
	description: string;
	$ref?: string;
	schema?: JSONSchema7;
	in?: string;
}

export interface Meta {
	url: string;
	method: HttpMethod;
}

export type AiTextGenerationToolInputWithFunction = AiTextGenerationToolInput["function"] & {
	function?: (args: any) => Promise<string>;
};

type InferValueType<T extends JSONSchema7> = T extends { type: "string" }
	? string
	: T extends { type: "number" }
		? number
		: T extends { type: "integer" }
			? number
			: T extends { type: "boolean" }
				? boolean
				: T extends { type: "null" }
					? null
					: T extends { type: "array"; items: JSONSchema7 }
						? Array<InferValueType<T["items"]>>
						: T extends {
									type: "object";
									properties: infer P;
									required?: readonly string[];
								}
							? InferObjectProperties<P, T["required"]>
							: unknown;

type InferObjectProperties<Properties, Required extends readonly string[] | undefined> = {
	[Property in keyof Properties]: Properties[Property] extends JSONSchema7
		? Required extends readonly string[]
			? Property extends Required[number]
				? InferValueType<Properties[Property]>
				: InferValueType<Properties[Property]> | undefined
			: InferValueType<Properties[Property]> | undefined
		: never;
};

type InferFunctionParameterType<T extends JSONSchema7> = T extends {
	type: "object";
}
	? InferObjectProperties<T["properties"], T["required"]>
	: never;

export interface ToolsSchema<T extends JSONSchema7> {
	name: string;
	description: string;
	parameters: T;
	function?: (args: InferFunctionParameterType<T>) => Promise<string>;
}

export function tool<T extends JSONSchema7>(tool: ToolsSchema<T>): ToolsSchema<T> {
	return tool;
}
