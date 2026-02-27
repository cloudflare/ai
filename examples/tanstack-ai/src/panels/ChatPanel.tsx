import { fetchHttpStream, useChat } from "@tanstack/ai-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConfig } from "../config";
import type { ProviderDef } from "../providers";
import type { ToolCallPart, ToolResultPart } from "@tanstack/ai";

function ToolCallDisplay({
	toolName,
	args,
	result,
	isUserMessage,
}: {
	toolName: string;
	args?: string;
	result?: string;
	isUserMessage: boolean;
}) {
	const [isExpanded, setIsExpanded] = useState(false);

	const argsStr = args ? formatJson(args) : null;
	const resultStr = result ? formatJson(result) : null;

	return (
		<div
			className={`text-xs rounded-lg px-2.5 py-1.5 font-mono ${
				isUserMessage
					? "bg-gray-800 text-gray-300"
					: "bg-gray-50 text-gray-500 border border-gray-100"
			}`}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center min-w-0">
					<span className="font-semibold">{toolName}</span>
					{!isExpanded && resultStr && (
						<span className="ml-1.5 opacity-75 truncate">
							{resultStr.length > 50 ? `${resultStr.slice(0, 50)}...` : resultStr}
						</span>
					)}
				</div>
				<button
					type="button"
					onClick={() => setIsExpanded(!isExpanded)}
					className={`shrink-0 p-0.5 rounded hover:bg-gray-200 transition-colors ${
						isUserMessage ? "hover:bg-gray-700" : ""
					}`}
					title={isExpanded ? "Collapse" : "Expand"}
				>
					<svg
						className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
					>
						<title>{isExpanded ? "Collapse" : "Expand"}</title>
						<path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
					</svg>
				</button>
			</div>
			{isExpanded && (
				<div className="mt-2 space-y-2">
					{argsStr && (
						<div>
							<p className="text-[10px] font-medium opacity-60 uppercase tracking-wide mb-1">
								Request
							</p>
							<pre
								className={`p-2 rounded text-[10px] whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto ${
									isUserMessage ? "bg-gray-700" : "bg-gray-100 text-gray-700"
								}`}
							>
								{argsStr}
							</pre>
						</div>
					)}
					{resultStr && (
						<div>
							<p className="text-[10px] font-medium opacity-60 uppercase tracking-wide mb-1">
								Result
							</p>
							<pre
								className={`p-2 rounded text-[10px] whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto ${
									isUserMessage ? "bg-gray-700" : "bg-gray-100 text-gray-700"
								}`}
							>
								{resultStr}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function formatJson(str: string): string {
	try {
		return JSON.stringify(JSON.parse(str), null, 2);
	} catch {
		return str;
	}
}

export function ChatPanel({ provider }: { provider: ProviderDef }) {
	const [workersAiModel, setWorkersAiModel] = useState(provider.chatModels?.[0]?.id ?? "");

	return (
		<div className="flex flex-col h-full">
			{/* Model selector (Workers AI only) */}
			{provider.chatModels && (
				<div className="px-4 sm:px-6 pt-3 pb-2 border-b border-gray-100 bg-white">
					<select
						value={workersAiModel}
						onChange={(e) => setWorkersAiModel(e.target.value)}
						className="text-xs text-gray-600 bg-white border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-300 cursor-pointer hover:border-gray-300 transition-colors"
					>
						{provider.chatModels.map((m) => (
							<option key={m.id} value={m.id}>
								{m.label} — {m.id}
							</option>
						))}
					</select>
				</div>
			)}

			<ChatView
				key={`${provider.id}:${workersAiModel}`}
				provider={provider}
				workersAiModel={workersAiModel}
			/>
		</div>
	);
}

function ChatView({ provider, workersAiModel }: { provider: ProviderDef; workersAiModel: string }) {
	const { headers } = useConfig();

	const headersRef = useRef(headers);
	headersRef.current = headers;
	const workersAiModelRef = useRef(workersAiModel);
	workersAiModelRef.current = workersAiModel;

	const connection = useMemo(
		() =>
			fetchHttpStream(`/ai/${provider.id}/chat`, () => {
				const h: Record<string, string> = { ...headersRef.current };
				if (workersAiModelRef.current) {
					h["X-Workers-AI-Model"] = workersAiModelRef.current;
				}
				return { headers: h };
			}),
		[provider.id],
	);

	const { messages, sendMessage, error, isLoading } = useChat({ connection });

	const [input, setInput] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on message count change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages.length]);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (input.trim() && !isLoading) {
			sendMessage(input);
			setInput("");
		}
	};

	console.log(messages);

	return (
		<>
			{error && (
				<div className="mx-4 sm:mx-6 mt-3 px-3 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
					{error.message}
				</div>
			)}

			<div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
				{messages.length === 0 ? (
					<div className="h-full flex items-center justify-center">
						<div className="text-center max-w-sm">
							<p className="text-sm font-medium text-gray-900 mb-1">
								Chat with {provider.label}
							</p>
							<p className="text-xs text-gray-500 leading-relaxed">
								Send a message to get started. Tool calling is enabled.
							</p>
							<div className="mt-4 flex flex-wrap gap-1.5 justify-center">
								{["What can you do?", "Tell me a joke", "What time is it?"].map(
									(prompt) => (
										<button
											key={prompt}
											type="button"
											onClick={() => sendMessage(prompt)}
											className="px-3 py-1.5 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
										>
											{prompt}
										</button>
									),
								)}
							</div>
						</div>
					</div>
				) : (
					<div className="space-y-4 pb-2">
						{messages
							.filter((m) =>
								m.parts.some(
									(p) =>
										p.type === "thinking" ||
										p.type !== "text" ||
										!!(p as { content?: string }).content,
								),
							)
							.map((message) => (
								<div
									key={message.id}
									className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
								>
									<div
										className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 ${
											message.role === "user"
												? "bg-gray-900 text-white"
												: "bg-white text-gray-900 border border-gray-200 shadow-sm"
										}`}
									>
										<div className="space-y-1">
											{message.parts.map((part) => {
												const partId =
													"id" in part && part.id
														? String(part.id)
														: "toolCallId" in part
															? String(
																	(
																		part as {
																			toolCallId?: string;
																		}
																	).toolCallId,
																)
															: `${part.type}-${("content" in part ? String(part.content) : "").slice(0, 32)}`;
												const key = `${message.id}-${partId}`;
												if (part.type === "text") {
													if (!(part as { content?: string }).content)
														return null;
													return (
														<div
															key={key}
															className="text-sm leading-relaxed whitespace-pre-wrap break-words"
														>
															{part.content}
														</div>
													);
												}
												if (part.type === "thinking") {
													const thinkContent = (
														part as { content?: string }
													).content;
													if (!thinkContent) return null;
													return (
														<div
															key={key}
															className="border-l-2 border-gray-300 pl-3 my-1"
														>
															<p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">
																Reasoning
															</p>
															<div className="text-xs text-gray-400 italic leading-relaxed whitespace-pre-wrap break-words">
																{thinkContent}
															</div>
														</div>
													);
												}
												if (part.type === "tool-call") {
													const toolCall = part as ToolCallPart;
													const toolResult = message.parts.find(
														(p): p is ToolResultPart =>
															p.type === "tool-result" &&
															(p as ToolResultPart).toolCallId ===
																toolCall.id,
													);
													return (
														<ToolCallDisplay
															key={key}
															toolName={toolCall.name ?? "tool"}
															args={toolCall.arguments}
															result={toolResult?.content}
															isUserMessage={message.role === "user"}
														/>
													);
												}
												if (part.type === "tool-result") {
													return null;
												}
												return null;
											})}
										</div>
									</div>
								</div>
							))}
						{isLoading && messages[messages.length - 1]?.role === "user" && (
							<div className="flex justify-start">
								<div className="bg-white border border-gray-200 shadow-sm rounded-2xl px-4 py-3">
									<div className="flex items-center gap-1.5">
										<div
											className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
											style={{ animationDelay: "0ms" }}
										/>
										<div
											className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
											style={{ animationDelay: "150ms" }}
										/>
										<div
											className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
											style={{ animationDelay: "300ms" }}
										/>
									</div>
								</div>
							</div>
						)}
						<div ref={messagesEndRef} />
					</div>
				)}
			</div>

			<div className="p-4 sm:p-6 pt-3 sm:pt-4 border-t border-gray-200 bg-white">
				<form onSubmit={handleSubmit} className="flex gap-2">
					<input
						ref={inputRef}
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Send a message..."
						disabled={isLoading}
						className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
					/>
					<button
						type="submit"
						disabled={isLoading || !input.trim()}
						className="px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
					>
						<svg
							className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<title>Send</title>
							{isLoading ? (
								<>
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
								</>
							) : (
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
								/>
							)}
						</svg>
					</button>
				</form>
				<p className="text-[10px] text-gray-400 mt-2 text-center">
					Tools: sum, multiply, get_current_time, random_number, reverse_string,
					web_scrape
				</p>
			</div>
		</>
	);
}
