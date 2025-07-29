// kilocode_change - new file
import type { Meta, StoryObj } from "@storybook/react-vite"
import { createSampleMessage } from "@/components/chat/hooks/useQueuedMessages"
import { QueuedMessageListExample } from "../src/components/chat/QueuedMessageListExample"

const sampleMessages = [
	createSampleMessage("Write a function to calculate fibonacci numbers"),
	createSampleMessage("Add error handling to the previous code", ["screenshot.png"]),
	createSampleMessage("", ["image1.jpg", "image2.png"]), // Image-only message
	createSampleMessage(
		"This is a very long message that should be truncated when displayed in the list to prevent layout issues and maintain readability",
	),
]

const meta = {
	title: "Component/QueuedMessageList",
	component: QueuedMessageListExample,
	tags: ["autodocs"],
	args: {
		initialMessages: [],
	},
} satisfies Meta<typeof QueuedMessageListExample>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	args: {
		initialMessages: sampleMessages,
	},
}

export const WithLongMessages: Story = {
	args: {
		initialMessages: [
			createSampleMessage(
				"This is a very long message that demonstrates how the component handles text truncation and maintains proper layout even with extensive content that would normally overflow the container",
			),
			createSampleMessage("Another long message with images", [
				"very-long-filename-that-might-cause-issues.png",
				"another-image.jpg",
			]),
		],
	},
}

export const ManyMessages: Story = {
	args: {
		initialMessages: Array.from({ length: 10 }, (_, i) =>
			createSampleMessage(`Queued message ${i + 1}`, i % 3 === 0 ? [`image${i}.png`] : []),
		),
	},
}

export const InteractivePlayground: Story = {
	args: {
		initialMessages: [
			createSampleMessage("Welcome! Try the buttons above to add messages"),
			createSampleMessage("You can also remove messages by clicking the trash icon", ["example.png"]),
		],
	},
}
