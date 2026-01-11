import { fetchHttpStream, useChat } from "@tanstack/ai-react";
import { useState } from "react";

type SupportedModels = "openai" | "anthropic" | "gemini" | "grok";

const selectedModel: SupportedModels = "grok";

function App() {
	const { messages, sendMessage, error, isLoading, clear } = useChat({
		connection: fetchHttpStream(`/ai/${selectedModel}`),
	});

	const [input, setInput] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (input.trim() && !isLoading) {
			sendMessage(input);
			setInput("");
		}
	};

	return (
		<div className="size-full flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 transition-colors duration-200">
			<div className="max-w-4xl w-full mx-auto flex flex-col h-full">
				<header className="flex justify-between items-center p-6 border-b border-gray-200 bg-white/50 backdrop-blur-sm">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
							AI Chat
						</h1>
						Model: {selectedModel}
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={clear}
							className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all duration-200 font-medium shadow-sm hover:shadow"
						>
							Clear
						</button>
					</div>
				</header>

				{error && (
					<div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg shadow-sm">
						<div className="font-semibold mb-1">Error</div>
						<div className="text-sm">{error.message}</div>
					</div>
				)}

				<div className="flex-1 overflow-y-auto px-6 py-4">
					{messages.length === 0 ? (
						<div className="h-full flex items-center justify-center">
							<div className="text-center space-y-4">
								<div className="text-6xl">💬</div>
								<div className="text-gray-500">
									<p className="text-lg font-medium">Start a conversation</p>
									<p className="text-sm">
										Send a message to begin chatting with AI
									</p>
								</div>
							</div>
						</div>
					) : (
						<div className="space-y-4 pb-4">
							{messages.map((message) => (
								<div
									key={message.id}
									className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
								>
									<div
										className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
											message.role === "user"
												? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
												: "bg-white text-gray-900 border border-gray-200"
										}`}
									>
										<div
											className={`text-xs font-semibold mb-2 ${
												message.role === "user"
													? "text-blue-100"
													: "text-gray-500"
											}`}
										>
											{message.role === "user" ? "You" : "Assistant"}
										</div>
										<div className="space-y-2">
											{message.parts.map((part, idx) => {
												if (part.type === "text") {
													return (
														<div
															key={`${message.id}-${idx}`}
															className="text-sm leading-relaxed whitespace-pre-wrap break-words"
														>
															{part.content}
														</div>
													);
												}
												return null;
											})}
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				<div className="p-6 border-t border-gray-200 bg-white/50 backdrop-blur-sm">
					<form onSubmit={handleSubmit} className="flex gap-3">
						<input
							type="text"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder="Type your message..."
							disabled={isLoading}
							className="flex-1 px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
						/>
						<button
							type="submit"
							disabled={isLoading || !input.trim()}
							className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg disabled:hover:shadow-md"
						>
							{isLoading ? (
								<span className="flex items-center gap-2">
									<svg
										className="animate-spin h-4 w-4"
										viewBox="0 0 24 24"
										aria-label="Loading"
									>
										<title>Loading</title>
										<circle
											className="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											strokeWidth="4"
											fill="none"
										/>
										<path
											className="opacity-75"
											fill="currentColor"
											d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
										/>
									</svg>
									Sending...
								</span>
							) : (
								"Send"
							)}
						</button>
					</form>
				</div>
			</div>
		</div>
	);
}

export default App;
