// kilocode_change - new file
import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"
import { QueuedMessageList } from "@/components/chat/QueuedMessageList"
import { createSampleMessage } from "@/components/chat/hooks/useQueuedMessages"

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
	component: QueuedMessageList,
	tags: ["autodocs"],
	args: {
		messages: [],
		onRemoveMessage: fn(),
	},
} satisfies Meta<typeof QueuedMessageList>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	args: {
		messages: sampleMessages,
	},
}

export const Empty: Story = {
	args: {
		messages: [],
	},
}

export const SingleMessage: Story = {
	args: {
		messages: [createSampleMessage("Single queued message")],
	},
}

export const TextOnly: Story = {
	args: {
		messages: [createSampleMessage("First text message"), createSampleMessage("Second text message")],
	},
}

export const WithImages: Story = {
	args: {
		messages: [
			createSampleMessage("Message with one image", ["screenshot.png"]),
			createSampleMessage("Message with multiple images", ["img1.jpg", "img2.png", "img3.gif"]),
		],
	},
}

export const ImageOnly: Story = {
	args: {
		messages: [createSampleMessage("", ["single-image.png"]), createSampleMessage("", ["img1.jpg", "img2.png"])],
	},
}

export const LongMessages: Story = {
	args: {
		messages: [
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
		messages: Array.from({ length: 10 }, (_, i) =>
			createSampleMessage(`Queued message ${i + 1}`, i % 3 === 0 ? [`image${i}.png`] : []),
		),
	},
}
