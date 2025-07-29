// kilocode_change - moved from webview-ui for Storybook-only usage
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { QueuedMessageList } from "@/components/chat/QueuedMessageList"
import { createSampleMessage, QueuedMessage } from "@/components/chat/hooks/useQueuedMessages"

interface QueuedMessageListExampleProps {
	initialMessages?: QueuedMessage[]
	className?: string
}

export function QueuedMessageListExample({ initialMessages = [], className }: QueuedMessageListExampleProps) {
	const [messages, setMessages] = useState<QueuedMessage[]>(initialMessages)

	const handleRemoveMessage = (messageId: string) => {
		setMessages((prev) => prev.filter((msg) => msg.id !== messageId))
	}

	const sampleTexts = [
		"Write a function to calculate fibonacci numbers",
		"Add error handling to the previous code",
		"Refactor this component to use TypeScript",
		"Create unit tests for the authentication service",
		"Optimize the database query performance",
		"Add responsive design to the dashboard",
	]

	const sampleImageMessages = [
		{ text: "Fix the layout issue shown in this screenshot", images: ["screenshot.png"] },
		{ text: "Implement the design from these mockups", images: ["design1.png", "design2.png"] },
		{ text: "", images: ["error-log.png"] },
		{
			text: "Update the UI based on these wireframes",
			images: ["wireframe1.jpg", "wireframe2.jpg", "wireframe3.jpg"],
		},
	]

	const addSampleMessage = (messageData: { text: string; images?: string[] }) => {
		const newMessage = createSampleMessage(messageData.text, messageData.images)
		setMessages((prev) => [...prev, newMessage])
	}

	const addSampleTextMessage = () => {
		const randomText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)]
		addSampleMessage({ text: randomText })
	}

	const addSampleImageMessage = () => {
		const randomMessage = sampleImageMessages[Math.floor(Math.random() * sampleImageMessages.length)]
		addSampleMessage({ text: randomMessage.text, images: randomMessage.images })
	}

	const addLongMessage = () => {
		addSampleMessage({
			text: "This is a very long message that demonstrates how the component handles text truncation and maintains proper layout even with extensive content that would normally overflow the container and cause layout issues in the user interface",
		})
	}

	const clearAllMessages = () => {
		setMessages([])
	}

	return (
		<div className={`space-y-4 ${className || ""}`}>
			<div className="flex flex-wrap gap-2">
				<Button onClick={addSampleTextMessage}>Add Text Message</Button>
				<Button onClick={addSampleImageMessage}>Add Image Message</Button>
				<Button onClick={addLongMessage}>Add Long Message</Button>
				<Button variant="secondary" onClick={clearAllMessages} disabled={messages.length === 0}>
					Clear All
				</Button>
			</div>

			<div className="text-sm text-vscode-descriptionForeground">Messages: {messages.length}</div>

			<QueuedMessageList messages={messages} onRemoveMessage={handleRemoveMessage} />
		</div>
	)
}
