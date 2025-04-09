import { z } from "zod";
import type { MyMCP } from "../index";
import { fetchCloudflareApi } from "../utils/cloudflare-api";

// Worker logs parameter schema
const workerNameParam = z.string().describe("The name of the worker to analyze logs for");
const filterErrorsParam = z.boolean().default(false).describe("If true, only shows error logs");
const limitParam = z
	.number()
	.min(1)
	.max(100)
	.default(100)
	.describe("Maximum number of logs to retrieve (1-100, default 100)");
const minutesAgoParam = z
	.number()
	.min(1)
	.max(1440)
	.default(30)
	.describe("Minutes in the past to look for logs (1-1440, default 30)");
const rayIdParam = z.string().optional().describe("Filter logs by specific Cloudflare Ray ID");

const RelevantLogInfoSchema = z.object({
	timestamp: z.string(),
	path: z.string().nullable(),
	method: z.string().nullable(),
	status: z.number().nullable(),
	outcome: z.string(),
	eventType: z.string(),
	duration: z.number().nullable(),
	error: z.string().nullable(),
	message: z.string().nullable(),
	requestId: z.string(),
	rayId: z.string().nullable(),
	exceptionStack: z.string().nullable(),
});
type RelevantLogInfo = z.infer<typeof RelevantLogInfoSchema>;

const TelemetryKeySchema = z.object({
	key: z.string(),
	type: z.enum(["string", "number", "boolean"]),
	lastSeen: z.number().optional(),
});
type TelemetryKey = z.infer<typeof TelemetryKeySchema>;

const LogsKeysResponseSchema = z.object({
	success: z.boolean(),
	result: z.array(TelemetryKeySchema).optional().default([]),
	errors: z
		.array(
			z.object({
				message: z.string().optional(),
			}),
		)
		.optional()
		.default([]),
	messages: z
		.array(
			z.object({
				message: z.string().optional(),
			}),
		)
		.optional()
		.default([]),
});

const WorkerRequestSchema = z.object({
	url: z.string().optional(),
	method: z.string().optional(),
	path: z.string().optional(),
	search: z.record(z.string()).optional(),
});

const WorkerResponseSchema = z.object({
	status: z.number().optional(),
});

const WorkerEventDetailsSchema = z.object({
	request: WorkerRequestSchema.optional(),
	response: WorkerResponseSchema.optional(),
	rpcMethod: z.string().optional(),
	rayId: z.string().optional(),
	executionModel: z.string().optional(),
});

const WorkerInfoSchema = z.object({
	scriptName: z.string(),
	outcome: z.string(),
	eventType: z.string(),
	requestId: z.string(),
	event: WorkerEventDetailsSchema.optional(),
	wallTimeMs: z.number().optional(),
	cpuTimeMs: z.number().optional(),
	executionModel: z.string().optional(),
});

const WorkerSourceSchema = z.object({
	exception: z
		.object({
			stack: z.string().optional(),
			name: z.string().optional(),
			message: z.string().optional(),
			timestamp: z.number().optional(),
		})
		.optional(),
});

type WorkerEventType = z.infer<typeof WorkerEventSchema>;
const WorkerEventSchema = z.object({
	$workers: WorkerInfoSchema.optional(),
	timestamp: z.number(),
	source: WorkerSourceSchema,
	dataset: z.string(),
	$metadata: z.object({
		id: z.string(),
		message: z.string().optional(),
		trigger: z.string().optional(),
		error: z.string().optional(),
	}),
});

const LogsEventsSchema = z.object({
	events: z.array(WorkerEventSchema).optional().default([]),
});

const LogsResponseSchema = z.object({
	success: z.boolean(),
	result: z
		.object({
			events: LogsEventsSchema.optional().default({ events: [] }),
		})
		.optional()
		.default({ events: { events: [] } }),
	errors: z
		.array(
			z.object({
				message: z.string().optional(),
			}),
		)
		.optional()
		.default([]),
	messages: z
		.array(
			z.object({
				message: z.string().optional(),
			}),
		)
		.optional()
		.default([]),
});

/**
 * Extracts only the most relevant information from a worker log event
 * @param event The raw worker log event
 * @returns Relevant information extracted from the log
 */
function extractRelevantLogInfo(event: WorkerEventType): RelevantLogInfo {
	const workers = event.$workers;
	const metadata = event.$metadata;
	const source = event.source;

	let path = null;
	let method = null;
	let status = null;

	if (workers?.event?.request) {
		path = workers.event.request.path ?? null;
		method = workers.event.request.method ?? null;
	}

	if (workers?.event?.response) {
		status = workers.event.response.status ?? null;
	}

	let error = null;
	if (metadata.error) {
		error = metadata.error;
	}

	let message = metadata?.message ?? null;
	if (!message) {
		if (workers?.event?.rpcMethod) {
			message = `RPC: ${workers.event.rpcMethod}`;
		} else if (path && method) {
			message = `${method} ${path}`;
		}
	}

	// Calculate duration
	const duration = (workers?.wallTimeMs || 0) + (workers?.cpuTimeMs || 0);

	// Extract rayId if available
	const rayId = workers?.event?.rayId ?? null;

	// Extract exception stack if available
	const exceptionStack = source?.exception?.stack ?? null;

	return {
		timestamp: new Date(event.timestamp).toISOString(),
		path,
		method,
		status,
		outcome: workers?.outcome || "unknown",
		eventType: workers?.eventType || "unknown",
		duration: duration || null,
		error,
		message,
		requestId: workers?.requestId || metadata?.id || "unknown",
		rayId,
		exceptionStack,
	};
}

/**
 * Fetches recent logs for a specified Cloudflare Worker
 * @param scriptName Name of the worker script to get logs for
 * @param accountId Cloudflare account ID
 * @param apiToken Cloudflare API token
 * @returns The logs analysis result with filtered relevant information
 */
export async function handleWorkerLogs({
	limit,
	minutesAgo,
	accountId,
	apiToken,
	shouldFilterErrors,
	scriptName,
	rayId,
}: {
	limit: number;
	minutesAgo: number;
	accountId: string;
	apiToken: string;
	shouldFilterErrors: boolean;
	scriptName?: string;
	rayId?: string;
}): Promise<{ relevantLogs: RelevantLogInfo[]; from: number; to: number }> {
	if (scriptName === undefined && rayId === undefined) {
		throw new Error("Either scriptName or rayId must be provided");
	}
	// Calculate timeframe based on minutesAgo parameter
	const now = Date.now();
	const fromTimestamp = now - minutesAgo * 60 * 1000;

	type QueryFilter = { id: string; key: string; type: string; operation: string; value?: string };
	const filters: QueryFilter[] = [];

	// Build query to fetch logs
	if (scriptName) {
		filters.push({
			id: "worker-name-filter",
			key: "$metadata.service",
			type: "string",
			value: scriptName,
			operation: "eq",
		});
	}

	if (shouldFilterErrors === true) {
		filters.push({
			id: "error-filter",
			key: "$metadata.error",
			type: "string",
			operation: "exists",
		});
	}

	// Add Ray ID filter if provided
	if (rayId) {
		filters.push({
			id: "ray-id-filter",
			key: "$workers.event.rayId",
			type: "string",
			value: rayId,
			operation: "eq",
		});
	}

	const queryPayload = {
		queryId: "workers-logs",
		timeframe: {
			from: fromTimestamp,
			to: now,
		},
		parameters: {
			datasets: ["cloudflare-workers"],
			filters,
			calculations: [],
			groupBys: [],
			havings: [],
		},
		view: "events",
		limit,
	};

	const data = await fetchCloudflareApi({
		endpoint: "/workers/observability/telemetry/query",
		accountId,
		apiToken,
		responseSchema: LogsResponseSchema,
		options: {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(queryPayload),
		},
	});

	const events = data.result?.events?.events || [];

	// Extract relevant information from each event
	const relevantLogs = events.map(extractRelevantLogInfo);

	return { relevantLogs, from: fromTimestamp, to: now };
}

/**
 * Fetches available telemetry keys for a specified Cloudflare Worker
 * @param scriptName Name of the worker script to get keys for
 * @param accountId Cloudflare account ID
 * @param apiToken Cloudflare API token
 * @returns List of telemetry keys available for the worker
 */
export async function handleWorkerLogsKeys(
	scriptName: string,
	minutesAgo: number,
	accountId: string,
	apiToken: string,
): Promise<TelemetryKey[]> {
	// Calculate timeframe (last 24 hours to ensure we get all keys)
	const now = Date.now();
	const fromTimestamp = now - minutesAgo * 60 * 1000;

	// Build query for telemetry keys
	const queryPayload = {
		queryId: "workers-keys",
		timeframe: {
			from: fromTimestamp,
			to: now,
		},
		parameters: {
			datasets: ["cloudflare-workers"],
			filters: [
				{
					id: "service-filter",
					key: "$metadata.service",
					type: "string",
					value: `${scriptName}`,
					operation: "eq",
				},
			],
		},
	};

	const data = await fetchCloudflareApi({
		endpoint: "/workers/observability/telemetry/keys",
		accountId,
		apiToken,
		responseSchema: LogsKeysResponseSchema,
		options: {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"portal-version": "2",
			},
			body: JSON.stringify(queryPayload),
		},
	});

	return data.result || [];
}

/**
 * Registers the logs analysis tool with the MCP server
 * @param server The MCP server instance
 * @param accountId Cloudflare account ID
 * @param apiToken Cloudflare API token
 */
export function registerLogsTools(agent: MyMCP) {
	// Register the worker logs analysis tool by worker name
	agent.server.tool(
		"worker_logs_by_worker_name",
		"Analyze recent logs for a Cloudflare Worker by worker name",
		{
			scriptName: workerNameParam,
			shouldFilterErrors: filterErrorsParam,
			limitParam,
			minutesAgoParam,
			rayId: rayIdParam,
		},
		async (params) => {
			const accountId = agent.getActiveAccountId();
			if (!accountId) {
				return {
					content: [
						{
							type: "text",
							text: "No currently active accountId. Try listing your accounts (accounts_list) and then setting an active account (set_active_account)",
						},
					],
				};
			}
			try {
				const { scriptName, shouldFilterErrors, limitParam, minutesAgoParam, rayId } =
					params;
				const { relevantLogs, from, to } = await handleWorkerLogs({
					scriptName,
					limit: limitParam,
					minutesAgo: minutesAgoParam,
					accountId,
					apiToken: agent.props.accessToken,
					shouldFilterErrors,
					rayId,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								logs: relevantLogs,
								stats: {
									total: relevantLogs.length,
									timeRange: {
										from,
										to,
									},
								},
							}),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								error: `Error analyzing worker logs: ${error instanceof Error && error.message}`,
							}),
						},
					],
				};
			}
		},
	);

	// Register tool to search logs by Ray ID across all workers
	agent.server.tool(
		"worker_logs_by_rayid",
		"Analyze recent logs across all workers for a specific request by Cloudflare Ray ID",
		{
			rayId: z.string().describe("Filter logs by specific Cloudflare Ray ID"),
			shouldFilterErrors: filterErrorsParam,
			limitParam,
			minutesAgoParam,
		},
		async (params) => {
			const accountId = agent.getActiveAccountId();
			if (!accountId) {
				return {
					content: [
						{
							type: "text",
							text: "No currently active accountId. Try listing your accounts (accounts_list) and then setting an active account (set_active_account)",
						},
					],
				};
			}
			try {
				const { rayId, shouldFilterErrors, limitParam, minutesAgoParam } = params;
				const { relevantLogs, from, to } = await handleWorkerLogs({
					limit: limitParam,
					minutesAgo: minutesAgoParam,
					accountId,
					apiToken: agent.props.accessToken,
					shouldFilterErrors,
					rayId,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								logs: relevantLogs,
								stats: {
									total: relevantLogs.length,
									timeRange: {
										from,
										to,
									},
								},
							}),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								error: `Error analyzing logs by Ray ID: ${error instanceof Error && error.message}`,
							}),
						},
					],
				};
			}
		},
	);

	// Register the worker telemetry keys tool
	agent.server.tool(
		"worker_logs_keys",
		"Get available telemetry keys for a Cloudflare Worker",
		{ scriptName: workerNameParam, minutesAgoParam },
		async (params) => {
			const accountId = agent.getActiveAccountId();
			if (!accountId) {
				return {
					content: [
						{
							type: "text",
							text: "No currently active accountId. Try listing your accounts (accounts_list) and then setting an active account (set_active_account)",
						},
					],
				};
			}
			try {
				const { scriptName, minutesAgoParam } = params;
				const keys = await handleWorkerLogsKeys(
					scriptName,
					minutesAgoParam,
					accountId,
					agent.props.accessToken,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								keys: keys.map((key) => ({
									key: key.key,
									type: key.type,
									lastSeen: key.lastSeen
										? new Date(key.lastSeen).toISOString()
										: null,
								})),
								stats: {
									total: keys.length,
									byType: keys.reduce(
										(acc, key) => {
											acc[key.type] = (acc[key.type] || 0) + 1;
											return acc;
										},
										{} as Record<string, number>,
									),
								},
							}),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								error: `Error retrieving worker telemetry keys: ${error instanceof Error && error.message}`,
							}),
						},
					],
				};
			}
		},
	);
}
