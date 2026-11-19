import { env } from "cloudflare:workers";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import type { AuthenticationContext, Objective } from "../types";
import { type RBACParams, stytchRBACEnforcement } from "./lib/auth.ts";
import { okrService } from "./OKRService.ts";

/**
 * `createOKRManagerServer` exposes the OKR Manager Service via the Model Context Protocol
 * for consumption by API Agents. It runs once per request, after
 * `stytchBearerTokenAuthMiddleware` has verified the caller.
 */
export function createOKRManagerServer() {
	const props = getMcpAuthContext()?.props as AuthenticationContext;
	console.log("Binding service to tenant", props.organizationID);
	const service = okrService(env, props.organizationID);

	const withRequiredPermissions = <T extends CallableFunction>(
		rbacParams: RBACParams,
		fn: T,
	): T => {
		const withRequiredPermissionsImpl = async (...args: unknown[]) => {
			await stytchRBACEnforcement(env, props, rbacParams);
			return fn(...args);
		};
		return withRequiredPermissionsImpl as unknown as T;
	};

	const formatResponse = (
		description: string,
		newState: Objective[],
	): {
		content: Array<{ type: "text"; text: string }>;
	} => {
		return {
			content: [
				{
					text: `Success! ${description}\n\nNew state:\n${JSON.stringify(
						newState,
						null,
						2,
					)}\n\nFor Organization:\n${props.organizationID}`,
					type: "text",
				},
			],
		};
	};

	const server = new McpServer({
		name: "OKR Manager",
		version: "1.0.0",
	});

	server.registerResource(
		"Objectives",
		new ResourceTemplate("okrmanager://objectives/{id}", {
			list: withRequiredPermissions(
				{ action: "read", resource_id: "objective" },
				async () => {
					const objectives = await service.get();

					return {
						resources: objectives.map((objective) => ({
							name: objective.objectiveText,
							uri: `okrmanager://objectives/${objective.id}`,
						})),
					};
				},
			),
		}),
		{},
		withRequiredPermissions(
			{ action: "read", resource_id: "objective" },
			async (uri: URL, { id }: Record<string, string | string[]>) => {
				const objectives = await service.get();
				const objective = objectives.find((objective) => objective.id === id);
				return {
					contents: [
						{
							text: JSON.stringify(objective, null, 2),
							uri: uri.href,
						},
					],
				};
			},
		),
	);

	server.registerResource(
		"Key Result",
		new ResourceTemplate("okrmanager://key_result/{id}", {
			list: withRequiredPermissions(
				{ action: "read", resource_id: "key_result" },
				async () => {
					const objectives = await service.get();

					return {
						resources: objectives.flatMap((objective) =>
							objective.keyResults.map((keyResult) => ({
								name: keyResult.text,
								uri: `okrmanager://key_result/${keyResult.id}`,
							})),
						),
					};
				},
			),
		}),
		{},
		withRequiredPermissions(
			{ action: "read", resource_id: "key_result" },
			async (uri: URL, { id }: Record<string, string | string[]>) => {
				const objectives = await service.get();
				const keyResults = objectives.flatMap((objective) => objective.keyResults);
				const keyResult = keyResults.find((keyResult) => keyResult.id === id);
				return {
					contents: [
						{
							text: JSON.stringify(keyResult, null, 2),
							uri: uri.href,
						},
					],
				};
			},
		),
	);

	server.registerTool(
		"listObjectives",
		{ description: "View all objectives and key results for the organization" },
		withRequiredPermissions({ action: "read", resource_id: "objective" }, async () => {
			const result = await service.get();
			return formatResponse("Objectives retrieved successfully", result);
		}),
	);

	const addObjectiveSchema = {
		objectiveText: z.string(),
	};
	server.registerTool(
		"addObjective",
		{
			description: "Add a new top-level objective for the organization",
			inputSchema: z.object(addObjectiveSchema),
		},
		withRequiredPermissions({ action: "create", resource_id: "objective" }, async (req) => {
			const result = await service.addObjective(req.objectiveText);
			return formatResponse("Objective added successfully", result);
		}),
	);

	const deleteObjectiveSchema = {
		okrID: z.string(),
	};
	server.registerTool(
		"deleteObjective",
		{
			description: "Remove an existing top-level objective from the organization",
			inputSchema: z.object(deleteObjectiveSchema),
		},
		withRequiredPermissions({ action: "delete", resource_id: "objective" }, async (req) => {
			const result = await service.deleteObjective(req.okrID);
			return formatResponse("Objective deleted successfully", result);
		}),
	);

	const addKeyResultSchema = {
		keyResultText: z.string(),
		okrID: z.string(),
	};
	server.registerTool(
		"addKeyResult",
		{
			description: "Add a new key result to a specific objective",
			inputSchema: z.object(addKeyResultSchema),
		},
		withRequiredPermissions({ action: "create", resource_id: "key_result" }, async (req) => {
			const result = await service.addKeyResult(req.okrID, req.keyResultText);
			return formatResponse("Key result added successfully", result);
		}),
	);

	const setKeyResultAttainmentSchema = {
		attainment: z.number().int().min(0).max(100),
		keyResultID: z.string(),
		okrID: z.string(),
	};
	server.registerTool(
		"setKeyResultAttainment",
		{
			description:
				"Set the attainment value for a specific key result in a specific objective",
			inputSchema: z.object(setKeyResultAttainmentSchema),
		},
		withRequiredPermissions({ action: "update", resource_id: "key_result" }, async (req) => {
			const result = await service.setKeyResultAttainment(
				req.okrID,
				req.keyResultID,
				req.attainment,
			);
			return formatResponse("Key result attainment set successfully", result);
		}),
	);

	const deleteKeyResultSchema = {
		keyResultID: z.string(),
		okrID: z.string(),
	};
	server.registerTool(
		"deleteKeyResult",
		{
			description: "Remove a key result from a specific objective",
			inputSchema: z.object(deleteKeyResultSchema),
		},
		withRequiredPermissions({ action: "delete", resource_id: "key_result" }, async (req) => {
			const result = await service.deleteKeyResult(req.okrID, req.keyResultID);
			return formatResponse("Key result deleted successfully", result);
		}),
	);

	return server;
}
