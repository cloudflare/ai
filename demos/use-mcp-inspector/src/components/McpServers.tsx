import { useState, useRef, useEffect } from 'react'
import { useMcp, type UseMcpResult, type Tool } from 'use-mcp/react'
import { Info, X } from 'lucide-react'

type ConnectionData = Omit<UseMcpResult, 'state'> & {
	state: 'not-connected' | UseMcpResult['state']
}

// MCP Connection wrapper that only renders when active
function McpConnection({ serverUrl, onConnectionUpdate }: { serverUrl: string; onConnectionUpdate: (data: ConnectionData) => void }) {
	// Use the MCP hook with the server URL
	const connection = useMcp({
		url: serverUrl,
		debug: true,
		autoRetry: false,
		popupFeatures: 'width=500,height=600,resizable=yes,scrollbars=yes',
	})

	// Update parent component with connection data
	useEffect(() => {
		onConnectionUpdate(connection)
	}, [connection, onConnectionUpdate])

	// Return null as this is just a hook wrapper
	return null
}

export function McpServers({ onToolsUpdate }: { onToolsUpdate?: (tools: Tool[]) => void }) {
	const [serverUrl, setServerUrl] = useState(() => {
		return sessionStorage.getItem('mcpServerUrl') || ''
	})
	const [isActive, setIsActive] = useState(false)

	const [connectionData, setConnectionData] = useState<ConnectionData>({
		state: 'not-connected',
		tools: [],
		error: undefined,
		log: [],
		authUrl: undefined,
		retry: () => {},
		disconnect: () => {},
		authenticate: () => Promise.resolve(undefined),
		callTool: (_name: string, _args?: Record<string, unknown>) => Promise.resolve(undefined),
		clearStorage: () => {},
	})
	const [toolForms, setToolForms] = useState<Record<string, Record<string, any>>>({})
	const [toolExecutionLogs, setToolExecutionLogs] = useState<Record<string, string>>({})
	const logRef = useRef<HTMLDivElement>(null)
	const executionLogRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

	// Extract connection properties
	const {
		state,
		tools,
		//error,
		log,
		authUrl,
		disconnect,
		authenticate,
	} = connectionData

	// Notify parent component when tools change
	useEffect(() => {
		if (onToolsUpdate && tools.length > 0) {
			onToolsUpdate(
				tools.map((t: Tool) => ({
					...t,
					callTool: (args: Record<string, unknown>) => connectionData.callTool(t.name, args),
				}))
			)
		}
	}, [tools, onToolsUpdate, connectionData.callTool])

	// Handle connection
	const handleConnect = () => {
		if (!serverUrl.trim()) return
		setIsActive(true)
	}

	// Handle disconnection
	const handleDisconnect = () => {
		disconnect()
		setIsActive(false)
		setConnectionData({
			state: 'not-connected',
			tools: [],
			error: undefined,
			log: [],
			authUrl: undefined,
			retry: () => {},
			disconnect: () => {},
			authenticate: () => Promise.resolve(undefined),
			callTool: (_name: string, _args?: Record<string, unknown>) => Promise.resolve(undefined),
			clearStorage: () => {},
		})
	}

	// Handle authentication if popup was blocked
	const handleManualAuth = async () => {
		try {
			await authenticate()
		} catch (err) {
			console.error('Authentication error:', err)
		}
	}

	// Auto-scroll log to bottom
	/* biome-ignore lint/correctness/useExhaustiveDependencies: eh */
	useEffect(() => {
		if (logRef.current) {
			logRef.current.scrollTop = logRef.current.scrollHeight
		}
	}, [log])

	// Generate status badge based on connection state
	const getStatusBadge = () => {
		const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium'

		switch (state) {
			case 'discovering':
				return <span className={`${baseClasses} bg-blue-100 text-blue-800`}>Discovering</span>
			case 'authenticating':
				return <span className={`${baseClasses} bg-purple-100 text-purple-800`}>Authenticating</span>
			case 'connecting':
				return <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>Connecting</span>
			case 'loading':
				return <span className={`${baseClasses} bg-orange-100 text-orange-800`}>Loading</span>
			case 'ready':
				return <span className={`${baseClasses} bg-green-100 text-green-800`}>Connected</span>
			case 'failed':
				return <span className={`${baseClasses} bg-red-100 text-red-800`}>Failed</span>
			/* biome-ignore lint/complexity/noUselessSwitchCase: eh */
			case 'not-connected':
			default:
				return <span className={`${baseClasses} bg-gray-100 text-gray-800`}>Not Connected</span>
		}
	}

	// Log the tools to console when they change (for debugging)
	useEffect(() => {
		if (tools.length > 0) {
			console.log('MCP Tools available:', tools)
		}
	}, [tools])

	// Initialize form data when tools change
	useEffect(() => {
		const newForms: Record<string, Record<string, any>> = {}
		tools.forEach((tool: Tool) => {
			if (tool.inputSchema?.properties) {
				const formData: Record<string, any> = {}
				Object.entries(tool.inputSchema.properties).forEach(([key, schema]: [string, any]) => {
					// Set default values based on type
					if (schema.type === 'number' || schema.type === 'integer') {
						formData[key] = schema.default || 0
					} else if (schema.type === 'boolean') {
						formData[key] = schema.default || false
					} else {
						formData[key] = schema.default || ''
					}
				})
				newForms[tool.name] = formData
			}
		})
		setToolForms(newForms)
	}, [tools])

	// Handle form input changes
	const handleFormChange = (toolName: string, fieldName: string, value: any) => {
		setToolForms((prev) => ({
			...prev,
			[toolName]: {
				...prev[toolName],
				[fieldName]: value,
			},
		}))
	}

	// Helper function to clean and update execution log
	const updateExecutionLog = (toolName: string, newContent: string) => {
		setToolExecutionLogs((prev) => {
			const currentLog = prev[toolName] || ''
			const updatedLog = currentLog + newContent
			// Remove blank lines and rejoin
			const cleanedLog = updatedLog
				.split('\n')
				.filter((line) => line.trim() !== '')
				.join('\n')
			return {
				...prev,
				[toolName]: `${cleanedLog}\n`,
			}
		})
	}

	// Handle tool execution
	const handleRunTool = async (tool: Tool) => {
		const args = toolForms[tool.name] || {}
		const argsStr = JSON.stringify(args)

		// Add execution start message
		const startMessage = `Calling ${tool.name}(${argsStr})\n`
		updateExecutionLog(tool.name, startMessage)

		try {
			const result = await connectionData.callTool(tool.name, args)
			const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
			updateExecutionLog(tool.name, `${resultStr}\n`)
		} catch (error) {
			updateExecutionLog(tool.name, `Error: ${error}\n`)
		}
	}

	// Auto-scroll execution logs to bottom when they change
	useEffect(() => {
		Object.keys(toolExecutionLogs).forEach((toolName) => {
			const textarea = executionLogRefs.current[toolName]
			if (textarea) {
				textarea.scrollTop = textarea.scrollHeight
			}
		})
	}, [toolExecutionLogs])

	// Clear execution log for specific tool
	const clearExecutionLog = (toolName: string) => {
		setToolExecutionLogs((prev) => ({
			...prev,
			[toolName]: '',
		}))
	}

	// Render form field based on schema
	const renderFormField = (toolName: string, fieldName: string, schema: any, isRequired: boolean) => {
		const value = toolForms[toolName]?.[fieldName] || ''

		if (schema.type === 'number' || schema.type === 'integer') {
			return (
				<input
					type="number"
					className="w-32 p-2 pr-6 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 placeholder-gray-300"
					value={value}
					step={schema.type === 'integer' ? 1 : 'any'}
					required={isRequired}
					onChange={(e) => {
						const newValue =
							e.target.value === ''
								? ''
								: schema.type === 'integer'
									? Number.parseInt(e.target.value) || 0
									: Number.parseFloat(e.target.value) || 0
						handleFormChange(toolName, fieldName, newValue)
					}}
				/>
			)
		} else if (schema.type === 'boolean') {
			return (
				<input
					type="checkbox"
					className="h-4 w-4 text-blue-600 rounded focus:ring-blue-300"
					checked={value}
					onChange={(e) => handleFormChange(toolName, fieldName, e.target.checked)}
				/>
			)
		} else {
			// String or other text input
			return (
				<input
					type="text"
					className="w-full p-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 placeholder-gray-300"
					value={value}
					required={isRequired}
					placeholder={schema.description || ''}
					onChange={(e) => handleFormChange(toolName, fieldName, e.target.value)}
				/>
			)
		}
	}

	return (
		<section className="rounded-lg bg-white p-4 border border-zinc-200">
			<div className="flex items-center justify-between">
				<span className="text-sm font-semibold">MCP Servers</span>
				{getStatusBadge()}
			</div>

			<p className="text-gray-500 text-xs mt-1 mb-3">
				Connect to Model Context Protocol (MCP) servers to access additional AI capabilities.
			</p>

			<div className="space-y-3">
				<div className="flex gap-2">
					<input
						type="text"
						className="flex-1 p-2 border border-gray-200 rounded text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
						placeholder="Enter MCP server URL"
						value={serverUrl}
						onChange={(e) => {
							const newValue = e.target.value
							setServerUrl(newValue)
							sessionStorage.setItem('mcpServerUrl', newValue)
						}}
						disabled={isActive && state !== 'failed'}
					/>

					{state === 'ready' || (isActive && state !== 'not-connected' && state !== 'failed') ? (
						<button
							type="button"
							className="px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-900 rounded text-sm font-medium whitespace-nowrap"
							onClick={handleDisconnect}
						>
							Disconnect
						</button>
					) : (
						<button
							type="button"
							className="bg-blue-600 hover:bg-blue-700 text-white rounded py-2 px-4 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
							onClick={handleConnect}
							disabled={isActive || !serverUrl.trim()}
						>
							Connect
						</button>
					)}
				</div>

				{/* Authentication Link if needed */}
				{authUrl && (
					<div className="p-3 bg-orange-50 border border-orange-200 rounded">
						<p className="text-xs mb-2">Authentication required. Please click the link below:</p>
						<a
							href={authUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-orange-700 hover:text-orange-800 underline"
							onClick={handleManualAuth}
						>
							Authenticate in new window
						</a>
					</div>
				)}

				{/* Available Tools section - always present */}
				<div>
					<h3 className="font-medium text-sm mb-3">Available Tools ({tools.length})</h3>

					{tools.length === 0 ? (
						<div className="border border-gray-200 rounded p-4 bg-gray-50 text-center text-gray-500 text-sm">
							No tools available. Connect to an MCP server to see available tools.
						</div>
					) : (
						<div className="border border-gray-200 rounded p-4 bg-gray-50 space-y-6">
							{tools.map((tool: Tool, index: number) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: eh
								<div key={index}>
									{/* Tool title outside the card */}
									<h4 className="font-bold text-base text-black mb-2">{tool.name}</h4>

									<div className="bg-white p-4 rounded border border-gray-100 shadow-sm">
										{tool.description && <p className="text-gray-600 mb-4 text-sm leading-relaxed">{tool.description}</p>}

										{/* Form for tool parameters */}
										{tool.inputSchema?.properties && (
											<div className="flex flex-wrap gap-3 mb-4">
												{Object.entries(tool.inputSchema.properties as Record<string, { type: string; description: string }>).map(
													([fieldName, schema]) => {
														const isRequired = tool.inputSchema.required?.includes(fieldName) || false
														const isTextInput = schema.type !== 'number' && schema.type !== 'integer' && schema.type !== 'boolean'
														return (
															<div key={fieldName} className={`space-y-1 ${isTextInput ? 'w-full' : ''}`}>
																<div className="flex items-center gap-2">
																	{/* biome-ignore lint/a11y/noLabelWithoutControl: eh */}
																	<label className="text-xs font-medium text-gray-700">{fieldName}</label>
																	{schema.description && (
																		<div className="relative group">
																			<Info size={12} className="text-gray-400 cursor-help" />
																			<div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
																				{schema.description}
																			</div>
																		</div>
																	)}
																</div>
																<div>{renderFormField(tool.name, fieldName, schema, isRequired)}</div>
															</div>
														)
													}
												)}
											</div>
										)}

										{/* Run button */}
										<button
											type="button"
											onClick={() => handleRunTool(tool)}
											disabled={state !== 'ready'}
											className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded py-2 px-4 text-sm font-medium mb-4"
										>
											Run
										</button>

										{/* Per-tool execution log - only show if there's content */}
										{toolExecutionLogs[tool.name] && (
											<div className="border-t border-gray-100 pt-4">
												<div className="flex items-center justify-between mb-2">
													<h5 className="font-medium text-sm text-gray-700">Execution Log</h5>
													<button
														type="button"
														onClick={() => clearExecutionLog(tool.name)}
														className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
													>
														<X size={12} />
														Clear
													</button>
												</div>
												<textarea
													ref={(el) => {
														executionLogRefs.current[tool.name] = el
													}}
													value={toolExecutionLogs[tool.name]}
													readOnly
													className="w-full h-32 p-2 border border-gray-200 rounded text-[10px] font-mono bg-gray-50 resize-none placeholder-gray-300"
													placeholder="Tool execution results will appear here..."
												/>
											</div>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Debug Log */}
				<div>
					{/* biome-ignore lint/a11y/noLabelWithoutControl: eh */}
					<label className="font-medium text-xs block mb-2">Debug Log</label>
					<div ref={logRef} className="border border-gray-200 rounded p-2 bg-gray-50 h-32 overflow-y-auto font-mono text-xs">
						{log.length > 0 ? (
							log.map((entry, index) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: eh
									key={index}
									className={`py-0.5 ${
										entry.level === 'debug'
											? 'text-gray-500'
											: entry.level === 'info'
												? 'text-blue-600'
												: entry.level === 'warn'
													? 'text-orange-600'
													: 'text-red-600'
									}`}
								>
									[{entry.level}] {entry.message}
								</div>
							))
						) : (
							<div className="text-gray-400">No log entries yet</div>
						)}
					</div>
					{connectionData?.state !== 'not-connected' && (
						<button
							type="button"
							onClick={() => {
								connectionData?.clearStorage()
								if (isActive) {
									handleDisconnect()
								}
							}}
							className="text-xs text-orange-600 hover:text-orange-800 hover:underline mt-2"
						>
							Clear stored authentication
						</button>
					)}
				</div>
			</div>

			{/* Only render the actual MCP connection when active */}
			{isActive && <McpConnection serverUrl={serverUrl} onConnectionUpdate={setConnectionData} />}
		</section>
	)
}
