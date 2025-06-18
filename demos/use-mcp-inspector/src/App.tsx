import { McpServers } from './components/McpServers.js'

function App() {
	return (
		<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
			<div className="w-full max-w-2xl">
				<div className="text-center mb-8">
					<h1 className="text-3xl font-bold text-gray-900 mb-2">MCP Inspector</h1>
					<p className="text-gray-600">Minimal demo showcasing the use-mcp React hook</p>
				</div>
				<McpServers />
			</div>
		</div>
	)
}

export default App
