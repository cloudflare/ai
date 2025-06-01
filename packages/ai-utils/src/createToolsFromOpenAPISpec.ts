import type { OpenAPIV3 } from "./types/openapi-schema";
import YAML from "yaml";
import type { JSONSchema7 } from "json-schema";
import type { AiTextGenerationToolInputWithFunction, HttpMethod } from "./types";
import { Logger } from "./logger";

interface ConfigRule {
	matcher: (values: { url: URL; method: HttpMethod }) => boolean;
	values: {
		headers?: Record<string, string>;
		pathData?: Record<string, string>;
		query?: Record<string, string>;
		body?: any;
		cookies?: Record<string, string>;
		formData?: Record<string, any>;
	};
}

interface Config {
	overrides: ConfigRule[];
	matchPatterns?: RegExp[];
	options?: {
		verbose?: boolean;
	};
}

interface Parameters {
	path: Record<string, JSONSchema7>;
	query: Record<string, JSONSchema7>;
	header: Record<string, JSONSchema7>;
	cookie: Record<string, JSONSchema7>;
	formData: Record<string, JSONSchema7>;
	body: Record<string, JSONSchema7>;
}

/**
 * Automatically creates tools and relevant functions from an OpenAPI specification.
 *
 * @param {string} spec The OpenAPI specifiction in either JSON or YAML format, or a URL to a remote OpenAPI specification.
 * @param {Config} config  Configuration options for the createToolsFromOpenAPISpec function.
 *
 * @param {Config.overrides} config.overrides An array of configuration rules  for the createToolsFromOpenAPISpec function.
 * @param {Config.overrides.matcher} config.overrides.matcher A function that takes in the URL and HTTP method of the request and returns a boolean indicating whether the function should be used for that request.
 * @param {Config.overrides.values} config.overrides.values An object containing the values to be used for the function. The values can be any of the following:
 * - headers: An object containing the headers to be used for the request.
 * - pathData: An object containing the path parameters to be used for the request.
 * - query: An object containing the query parameters to be used for the request.
 * - body: An object containing the body to be used for the request.
 * - cookies: An object containing the cookies to be used for the request.
 * - formData: An object containing the form data to be used for the request.
 * @param {Config.matchPatterns} config.matchPatterns An array of regular expressions to match against the URL of the request. If any of the patterns match, the function will be used.
 * @param {Config.options} config.options Configuration options for the createToolsFromOpenAPISpec function.
 * @param {boolean} [config.options.verbose=false] Whether to enable verbose logging.
 *
 * @returns
 */
export async function createToolsFromOpenAPISpec(
	spec: string,
	config: Config = { overrides: [], options: { verbose: false } },
): Promise<AiTextGenerationToolInputWithFunction[]> {
	const openapiSpec = await fetchSpec(spec);
	if (!openapiSpec) {
		throw new Error("Failed to fetch or parse the OpenAPI specification");
	}

	if (config.options?.verbose) {
		Logger.enableLogging();
	}

	const tools: AiTextGenerationToolInputWithFunction[] = [];

	for (const path in openapiSpec.paths) {
		const pathData = openapiSpec.paths[path];
		for (const method in pathData) {
			if (!isHttpMethod(method)) continue;

			const operation = pathData[
				method as keyof typeof pathData
			] as OpenAPIV3.OperationObject;
			const url = getServerUrl(openapiSpec, pathData);
			const meta = {
				url: `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, "")}${path}`,
				method: method as HttpMethod,
			};

			if (
				config.matchPatterns &&
				!config.matchPatterns.some((pattern) => pattern.test(meta.url))
			) {
				continue;
			}

			const parameters = extractParameters(pathData, operation, openapiSpec);
			const requestBody = extractRequestBody(operation, openapiSpec);
			const toolFunction = createToolFunction(meta, parameters, requestBody, config);

			const parameterProperties: { [key: string]: JSONSchema7 } = {};

			if (Object.keys(parameters.path).length > 0) {
				parameterProperties.path = {
					type: "object",
					properties: parameters.path,
					required: Object.keys(parameters.path).filter(
						(param) => parameters.path[param].required,
					),
				};
			}
			if (Object.keys(parameters.query).length > 0) {
				parameterProperties.query = {
					type: "object",
					properties: parameters.query,
					required: Object.keys(parameters.query).filter(
						(param) => parameters.query[param].required,
					),
				};
			}
			if (Object.keys(parameters.header).length > 0) {
				parameterProperties.header = {
					type: "object",
					properties: parameters.header,
					required: Object.keys(parameters.header).filter(
						(param) => parameters.header[param].required,
					),
				};
			}
			if (Object.keys(parameters.cookie).length > 0) {
				parameterProperties.cookie = {
					type: "object",
					properties: parameters.cookie,
					required: Object.keys(parameters.cookie).filter(
						(param) => parameters.cookie[param].required,
					),
				};
			}
			if (Object.keys(parameters.formData).length > 0) {
				parameterProperties.formData = {
					type: "object",
					properties: parameters.formData,
					required: Object.keys(parameters.formData).filter(
						(param) => parameters.formData[param].required,
					),
				};
			}
			if (Object.keys(parameters.body).length > 0) {
				parameterProperties.body = {
					type: "object",
					properties: parameters.body,
					required: Object.keys(parameters.body).filter(
						(param) => parameters.body[param].required,
					),
				};
			}

			tools.push({
				name: operation.operationId ?? generateRandomString(),
				description: operation.summary ?? "",
				parameters: {
					type: "object",
					// @ts-expect-error @cloudflare/workers-types doesn't have the correct type
					properties: parameterProperties,
					required: [],
				},
				function: toolFunction,
			});
		}
	}

	return tools;
}

async function fetchSpec(spec: string): Promise<OpenAPIV3.Document | undefined> {
	let content: string;
	if (spec.startsWith("http")) {
		const res = await fetch(spec);
		content = await res.text();
	} else {
		content = spec;
	}

	try {
		if (content.trim().startsWith("{")) {
			return JSON.parse(content) as OpenAPIV3.Document;
		}
		return YAML.parse(content) as OpenAPIV3.Document;
	} catch (error) {
		console.error("Error parsing the OpenAPI spec:", error);
		return undefined;
	}
}

function getServerUrl(openapiSpec: OpenAPIV3.Document, pathData: OpenAPIV3.PathItemObject): URL {
	let rawUrl = pathData.servers?.[0]?.url;
	if (!rawUrl) {
		rawUrl = openapiSpec.servers?.[0]?.url;
	}
	if (!rawUrl) {
		throw new Error("No server URL found in OpenAPI spec");
	}
	return new URL(rawUrl);
}

function isHttpMethod(method: string): method is HttpMethod {
	const httpMethods: HttpMethod[] = ["get", "post", "put", "patch", "delete", "options", "head"];
	return httpMethods.includes(method.toLowerCase() as HttpMethod);
}

function extractParameters(
	pathData: OpenAPIV3.PathItemObject,
	operation: OpenAPIV3.OperationObject,
	openapiSpec: OpenAPIV3.Document,
): Parameters {
	const parameters: Parameters = {
		path: {},
		query: {},
		header: {},
		cookie: {},
		formData: {},
		body: {},
	};

	const allParams = [...(pathData.parameters || []), ...(operation.parameters || [])];

	for (const param of allParams) {
		const resolvedParam = resolveReference(param, openapiSpec) as OpenAPIV3.ParameterObject;
		const paramInfo: JSONSchema7 = {
			type: (resolvedParam.schema as OpenAPIV3.SchemaObject).type ?? "string",
			description: resolvedParam.description,
		};

		parameters[resolvedParam.in as keyof Parameters][resolvedParam.name] =
			paramInfo as JSONSchema7;
	}

	return parameters;
}

function extractRequestBody(
	operation: OpenAPIV3.OperationObject,
	openapiSpec: OpenAPIV3.Document,
): JSONSchema7 | undefined {
	if (!operation.requestBody) return undefined;
	const resolvedBody = resolveReference(
		operation.requestBody,
		openapiSpec,
	) as OpenAPIV3.RequestBodyObject;
	if (resolvedBody.content?.["application/json"]?.schema) {
		return resolvedBody.content["application/json"].schema as JSONSchema7;
	}
	return undefined;
}

function resolveReference(
	ref: OpenAPIV3.ReferenceObject | any,
	openapiSpec: OpenAPIV3.Document,
): any {
	if (!ref.$ref) return ref;
	const refPath = ref.$ref.replace(/^#\//, "").split("/");
	return refPath.reduce((acc: any, part: string) => acc?.[part], openapiSpec);
}

function createToolFunction(
	meta: { url: string; method: HttpMethod },
	_parameters: Parameters,
	requestBody: JSONSchema7 | undefined,
	config: Config,
): (args: Record<string, any>) => Promise<string> {
	return async (args: Record<string, any>) => {
		const url = new URL(meta.url);
		const init: RequestInit = {
			method: meta.method.toUpperCase(),
			headers: new Headers(),
		};
		const queryParams = new URLSearchParams();
		let body: any = {};

		Logger.info("Initial args:", args);

		if (
			Object.keys(args).length > 0 &&
			!args.header &&
			!args.query &&
			!args.cookie &&
			!args.formData &&
			!args.body
		) {
			// If args are there, but nothing else,
			// that means the AI might have hallucinated a query string inside the entire args object.
			args.query = args;
		}

		// Apply config rules
		for (const rule of config.overrides) {
			if (
				rule.matcher({
					url,
					method: meta.method,
				})
			) {
				if (rule.values.headers) {
					for (const key in rule.values.headers) {
						(init.headers as Headers).append(key, rule.values.headers[key]);
					}
				}
				if (rule.values.pathData) {
					for (const key in rule.values.pathData) {
						if (url.pathname.includes(`{${key}}`)) {
							url.pathname = url.pathname.replace(
								`{${key}}`,
								encodeURIComponent(rule.values.pathData[key]),
							);
						}
					}
				}
				if (rule.values.query) {
					for (const key in rule.values.query) {
						queryParams.append(key, rule.values.query[key]);
					}
				}
				if (rule.values.body) {
					body = { ...body, ...rule.values.body };
				}
				if (rule.values.cookies) {
					const cookieHeader = Object.entries(rule.values.cookies)
						.map(([key, value]) => `${key}=${value}`)
						.join("; ");
					(init.headers as Headers).append("Cookie", cookieHeader);
				}
				if (rule.values.formData) {
					const formData = new URLSearchParams();
					for (const key in rule.values.formData) {
						formData.append(key, rule.values.formData[key]);
					}
					init.body = formData.toString();
				}
			}
		}

		Logger.info("URL before path replacement:", url.toString());

		// Decode URL to replace path parameters
		let decodedPathname = decodeURIComponent(url.pathname);
		for (const key in args.path) {
			if (decodedPathname.includes(`{${key}}`)) {
				decodedPathname = decodedPathname.replace(
					`{${key}}`,
					encodeURIComponent(args.path[key]),
				);
			}
		}
		url.pathname = decodedPathname;

		Logger.info("URL after path replacement:", url.toString());

		// Query parameters
		for (const key in args.query) {
			queryParams.append(key, args.query[key]);
		}
		url.search = queryParams.toString();

		Logger.info("Query parameters:", url.search);

		// Headers
		for (const key in args.header) {
			(init.headers as Headers).append(key, args.header[key]);
		}

		Logger.info("Headers:", init.headers);

		// Cookies
		if (args.cookie) {
			const cookieHeader = Object.entries(args.cookie)
				.map(([key, value]) => `${key}=${value}`)
				.join("; ");
			(init.headers as Headers).append("Cookie", cookieHeader);
		}

		// Body
		if (requestBody) {
			init.body = JSON.stringify(args.body);
			(init.headers as Headers).append("Content-Type", "application/json");
		} else if (Object.keys(body).length > 0) {
			init.body = JSON.stringify(body);
			(init.headers as Headers).append("Content-Type", "application/json");
		}

		Logger.info("Request body:", init.body);

		try {
			const res = await fetch(url.toString(), init);
			const result = await res.text();
			Logger.info("Response:", result);
			return result;
		} catch (error) {
			if (error instanceof Error) {
				return JSON.stringify({ error: error.message });
			}
			return JSON.stringify({ error: String(error) });
		}
	};
}

function generateRandomString(): string {
	return Math.random().toString(36).substring(7);
}
