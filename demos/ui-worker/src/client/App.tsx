import { useChat } from "@ai-sdk/react";
import { Button, Center, Group, Paper, ScrollArea, Stack, Text, TextInput } from "@mantine/core";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

const ChatUI: React.FC = () => {
	const [input, setInput] = useState("");
	const { messages, sendMessage } = useChat({
		transport: new DefaultChatTransport({ api: "/api" }),
	});
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		sendMessage({ text: input });
		setInput("");
	};

	return (
		<Center style={{ height: "100vh", backgroundColor: "#f5f5f5" }}>
			<Paper shadow="sm" p="md" style={{ width: "90%", maxWidth: 1000 }}>
				<ScrollArea style={{ height: 700, marginBottom: "1rem" }}>
					<Stack gap="xs">
						{messages.map((message) => (
							<Paper key={message.id} p="xs" shadow="xs">
								<Text>{message.role === "user" ? "User" : "Assistant"}:</Text>
								<Text>
									{message.parts
										.filter((part) => part.type === "text")
										.map((part) => part.text)
										.join("")}
								</Text>
							</Paper>
						))}
					</Stack>
				</ScrollArea>
				<form onSubmit={handleSubmit}>
					<Group>
						<TextInput
							name="chat-input"
							value={input}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								setInput(e.target.value)
							}
							placeholder="Type your message..."
							style={{ flexGrow: 1 }}
						/>
						<Button type="submit" variant="filled">
							Send
						</Button>
					</Group>
				</form>
			</Paper>
		</Center>
	);
};

export default ChatUI;
