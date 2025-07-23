// kilocode_change - separated from QueuedMessageList.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite"
import { QueuedMessageListExample } from "../src/components/chat/QueuedMessageListExample"
import { createSampleMessage } from "@/components/chat/hooks/useQueuedMessages"

const meta = {
	title: "Component/QueuedMessageListExample",
	component: QueuedMessageListExample,
	tags: ["autodocs"],
	args: {
		initialMessages: [],
	},
} satisfies Meta<typeof QueuedMessageListExample>

export default meta
type Story = StoryObj<typeof meta>

export const InteractiveExample: Story = {
	args: {
		initialMessages: [
			createSampleMessage("Welcome! Try the buttons above to add messages"),
			createSampleMessage("You can also remove messages by clicking the trash icon", ["example.png"]),
		],
	},
}

export const InteractiveEmpty: Story = {
	args: {
		initialMessages: [],
	},
}
