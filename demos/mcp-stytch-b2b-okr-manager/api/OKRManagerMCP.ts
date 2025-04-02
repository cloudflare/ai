import {McpServer, ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'
import {okrService} from "./OKRService.ts";
import {AuthenticationContext, Objective} from "../types";
import {McpAgent} from "agents/mcp";
import {RBACParams, stytchRBACEnforcement} from "./lib/auth.ts";


/**
 * The `OKRManagerMCP` class exposes the OKR Manager Service via the Model Context Protocol
 * for consumption by API Agents
 */
export class OKRManagerMCP extends McpAgent<Env, unknown, AuthenticationContext> {
    async init() {
    }

    get okrService() {
        console.log('Binding service to tenant', this.props.organizationID);
        return okrService(this.env, this.props.organizationID)
    }

    withRequiredPermissions = <T extends CallableFunction>(rbacParams: RBACParams, fn: T): T => {
        const withRequiredPermissionsImpl = async (...args: unknown[]) => {
            await stytchRBACEnforcement(this.env, this.props, rbacParams)
            return fn(...args)
        }
        return withRequiredPermissionsImpl as unknown as T
    }

    formatResponse = (description: string, newState: Objective[]): {
        content: Array<{ type: 'text', text: string }>
    } => {
        return {
            content: [{
                type: "text",
                text: `Success! ${description}\n\nNew state:\n${JSON.stringify(newState, null, 2)}\n\nFor Organization:\n${this.props.organizationID}`
            }]
        };
    }

    get server() {
        const server = new McpServer({
            name: 'OKR Manager',
            version: '1.0.0',
        })

        server.resource("Objectives", new ResourceTemplate("okrmanager://objectives/{id}", {
                list: this.withRequiredPermissions({resource_id: 'objective', action: 'read'},
                    async () => {
                        const objectives = await this.okrService.get()

                        return {
                            resources: objectives.map(objective => ({
                                name: objective.objectiveText,
                                uri: `okrmanager://objectives/${objective.id}`
                            }))
                        }
                    })
            }),
            this.withRequiredPermissions({resource_id: 'objective', action: 'read'},
                async (uri, {id}) => {
                    const objectives = await this.okrService.get();
                    const objective = objectives.find(objective => objective.id === id);
                    return {
                        contents: [
                            {
                                uri: uri.href,
                                text: JSON.stringify(objective, null, 2),
                            },
                        ],
                    }
                }),
        )

        server.resource("Key Result", new ResourceTemplate("okrmanager://key_result/{id}", {
                list: this.withRequiredPermissions({resource_id: 'key_result', action: 'read'},
                    async () => {
                        const objectives = await this.okrService.get()

                        return {
                            resources: objectives.flatMap(objective => objective.keyResults.map(keyResult => ({
                                name: keyResult.text,
                                uri: `okrmanager://key_result/${keyResult.id}`
                            })))
                        }
                    })
            }),
            this.withRequiredPermissions({resource_id: 'key_result', action: 'read'},
                async (uri, {id}) => {
                    const objectives = await this.okrService.get();
                    const keyResults = objectives.flatMap(objective => objective.keyResults)
                    const keyResult = keyResults.find(keyResult => keyResult.id === id);
                    return {
                        contents: [
                            {
                                uri: uri.href,
                                text: JSON.stringify(keyResult, null, 2),
                            },
                        ],
                    }
                }),
        )

        server.tool('listObjectives', 'View all objectives and key results for the organization',
            this.withRequiredPermissions({action: 'read', resource_id: 'objective'}, async () => {
                const result = await this.okrService.get()
                return this.formatResponse('Objectives retrieved successfully', result);
            }))

        const addObjectiveSchema = {
            objectiveText: z.string(),
        }
        server.tool('addObjective', 'Add a new top-level objective for the organization', addObjectiveSchema,
            this.withRequiredPermissions({action: 'create', resource_id: 'objective'}, async (req) => {
                const result = await this.okrService.addObjective(req.objectiveText)
                return this.formatResponse('Objective added successfully', result);
            }))

        const deleteObjectiveSchema = {
            okrID: z.string()
        }
        server.tool('deleteObjective', 'Remove an existing top-level objective from the organization', deleteObjectiveSchema,
            this.withRequiredPermissions({action: 'delete', resource_id: 'objective'}, async (req) => {
                const result = await this.okrService.deleteObjective(req.okrID);
                return this.formatResponse('Objective deleted successfully', result);
            }));

        const addKeyResultSchema = {
            okrID: z.string(),
            keyResultText: z.string()
        }
        server.tool('addKeyResult', 'Add a new key result to a specific objective', addKeyResultSchema,
            this.withRequiredPermissions({action: 'create', resource_id: 'key_result'}, async (req) => {
                const result = await this.okrService.addKeyResult(req.okrID, req.keyResultText);
                return this.formatResponse('Key result added successfully', result);
            }));

        const setKeyResultAttainmentSchema = {
            okrID: z.string(),
            keyResultID: z.string(),
            attainment: z.number().int().min(0).max(100)
        }
        server.tool('setKeyResultAttainment', 'Set the attainment value for a specific key result in a specific objective', setKeyResultAttainmentSchema,
            this.withRequiredPermissions({action: 'update', resource_id: 'key_result'}, async (req) => {
                const result = await this.okrService.setKeyResultAttainment(req.okrID, req.keyResultID, req.attainment);
                return this.formatResponse('Key result attainment set successfully', result);
            }));

        const deleteKeyResultSchema = {
            okrID: z.string(),
            keyResultID: z.string()
        };
        server.tool('deleteKeyResult', 'Remove a key result from a specific objective', deleteKeyResultSchema,
            this.withRequiredPermissions({action: 'delete', resource_id: 'key_result'}, async (req) => {
                const result = await this.okrService.deleteKeyResult(req.okrID, req.keyResultID);
                return this.formatResponse('Key result deleted successfully', result);
            }));

        return server
    }
}