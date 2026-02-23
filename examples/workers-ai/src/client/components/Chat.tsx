import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useMemo } from "react";
import { useConfig } from "../config";
import { useUniqueId } from "../utils/useUniqueId";
import { chatModels } from "./models";

export function Chat() {
	const [model, setModel] = useState(chatModels[0].id);

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="px-4 sm:px-6 py-2 border-b border-gray-100 flex items-center gap-2">
				<label className="text-[10px] font-medium text-gray-600">Model</label>
				<select
					value={model}
					onChange={(e) => setModel(e.target.value)}
					className="text-xs text-gray-600 bg-white border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-900"
				>
					{chatModels.map((m) => (
						<option key={m.id} value={m.id}>
							{m.label}
						</option>
					))}
				</select>
			</div>
			<ChatSession key={model} model={model} />
		</div>
	);
}

function ChatSession({ model }: { model: string }) {
	const { headers } = useConfig();
	const chatId = useUniqueId({ model, headers }, "chat");

	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/chat",
				body: { model },
				headers,
			}),
		[model, headers],
	);

	const { messages, sendMessage, status, error } = useChat({ id: chatId, transport });
	const [input, setInput] = useState("");
	const isLoading = status === "streaming" || status === "submitted";

	const scrollAnchorRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		scrollAnchorRef.current?.scrollIntoView({ behavior: "instant" });
	}, [messages]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim() || isLoading) return;
		sendMessage({ text: input });
		setInput("");
	};

	return (
		<>
			<div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
				{messages.length === 0 && !error && (
					<div className="text-center text-sm text-gray-400 py-12">
						Send a message to start chatting.
						<br />
						<span className="text-xs">
							Try asking about the weather to see tool calling in action.
						</span>
					</div>
				)}
				{messages.map((message) => (
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
							{message.parts.map((part, i) => {
								if (part.type === "text") {
									return (
										<span
											key={`${message.id}-${part.type}-${i}`}
											className="text-sm leading-relaxed whitespace-pre-wrap"
										>
											{part.text}
										</span>
									);
								}
								if (part.type === "reasoning") {
									return (
										<div
											key={`${message.id}-reasoning-${i}`}
											className="border-l-2 border-gray-300 pl-3 my-1"
										>
											<p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">
												Reasoning
											</p>
											<div className="text-xs text-gray-400 italic leading-relaxed whitespace-pre-wrap">
												{part.text}
											</div>
										</div>
									);
								}
								if (part.type === "tool-invocation") {
									const toolPart = part as {
										toolName?: string;
										args?: unknown;
										result?: unknown;
										state?: string;
									};
									return (
										<div
											key={`${message.id}-tool-${i}`}
											className="text-xs rounded-lg px-2.5 py-1.5 font-mono bg-gray-50 text-gray-500 border border-gray-100 my-1"
										>
											<span className="font-semibold">
												{toolPart.toolName ?? "tool"}
											</span>
											{toolPart.args != null && (
												<pre className="mt-1 text-[10px] opacity-75 overflow-x-auto">
													{JSON.stringify(toolPart.args, null, 2)}
												</pre>
											)}
											{toolPart.state === "result" && (
												<pre className="mt-1 text-[10px] text-emerald-600 overflow-x-auto">
													{JSON.stringify(toolPart.result, null, 2)}
												</pre>
											)}
										</div>
									);
								}
								return null;
							})}
						</div>
					</div>
				))}
				{isLoading && messages[messages.length - 1]?.role !== "assistant" && (
					<div className="flex justify-start">
						<div className="rounded-2xl px-4 py-2.5 bg-white border border-gray-200 shadow-sm">
							<div className="flex items-center gap-1.5">
								<div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
								<div
									className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
									style={{ animationDelay: "0.15s" }}
								/>
								<div
									className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
									style={{ animationDelay: "0.3s" }}
								/>
							</div>
						</div>
					</div>
				)}
				<div ref={scrollAnchorRef} />
			</div>

			{error && (
				<div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
					{error.message || "Something went wrong."}
				</div>
			)}

			<form
				className="border-t border-gray-200 px-4 sm:px-6 py-3 flex gap-2"
				onSubmit={handleSubmit}
			>
				<input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Ask anything... try 'What's the weather in Paris?'"
					disabled={isLoading}
					className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
				/>
				<button
					type="submit"
					disabled={isLoading || !input.trim()}
					className="px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
				>
					Send
				</button>
			</form>
		</>
	);
}
