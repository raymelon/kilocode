// kilocode_change - new file
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueuedMessageList } from "../QueuedMessageList"
import { createSampleMessage } from "../hooks/useQueuedMessages"

describe("QueuedMessageList", () => {
	const mockOnRemoveMessage = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders empty div when no messages", () => {
		const { container } = render(<QueuedMessageList messages={[]} onRemoveMessage={mockOnRemoveMessage} />)

		expect(container.firstChild).toHaveClass("mx-2", "pb-2")
		expect(container.firstChild).toBeEmptyDOMElement()
	})

	it("renders list of messages", () => {
		const messages = [createSampleMessage("First message"), createSampleMessage("Second message")]

		render(<QueuedMessageList messages={messages} onRemoveMessage={mockOnRemoveMessage} />)

		expect(screen.getByText("First message")).toBeInTheDocument()
		expect(screen.getByText("Second message")).toBeInTheDocument()
	})

	it("displays image count for messages with images", () => {
		const messages = [createSampleMessage("Message with images", ["img1.png", "img2.jpg"])]

		render(<QueuedMessageList messages={messages} onRemoveMessage={mockOnRemoveMessage} />)

		expect(screen.getByText("Message with images")).toBeInTheDocument()
		expect(screen.getByText("+ 2 images")).toBeInTheDocument()
	})

	it("displays image count for image-only messages", () => {
		const messages = [createSampleMessage("", ["img1.png", "img2.jpg"])]

		render(<QueuedMessageList messages={messages} onRemoveMessage={mockOnRemoveMessage} />)

		expect(screen.getByText("2 image(s)")).toBeInTheDocument()
	})

	it("handles empty message text", () => {
		const messages = [createSampleMessage("")]

		render(<QueuedMessageList messages={messages} onRemoveMessage={mockOnRemoveMessage} />)

		expect(screen.getByText("Empty message")).toBeInTheDocument()
	})

	it("calls onRemoveMessage when trash button is clicked", async () => {
		const user = userEvent.setup()
		const messages = [createSampleMessage("Test message")]

		render(<QueuedMessageList messages={messages} onRemoveMessage={mockOnRemoveMessage} />)

		const removeButton = screen.getByTitle("Remove queued message")
		await user.click(removeButton)

		expect(mockOnRemoveMessage).toHaveBeenCalledWith(messages[0].id)
	})

	it("renders multiple remove buttons for multiple messages", () => {
		const messages = [
			createSampleMessage("First message"),
			createSampleMessage("Second message"),
			createSampleMessage("Third message"),
		]

		render(<QueuedMessageList messages={messages} onRemoveMessage={mockOnRemoveMessage} />)

		const removeButtons = screen.getAllByTitle("Remove queued message")
		expect(removeButtons).toHaveLength(3)
	})

	it("calls onRemoveMessage with correct message ID", async () => {
		const user = userEvent.setup()
		const messages = [createSampleMessage("First message"), createSampleMessage("Second message")]

		render(<QueuedMessageList messages={messages} onRemoveMessage={mockOnRemoveMessage} />)

		const removeButtons = screen.getAllByTitle("Remove queued message")

		// Click the second remove button
		await user.click(removeButtons[1])

		expect(mockOnRemoveMessage).toHaveBeenCalledWith(messages[1].id)
	})

	it("applies custom className", () => {
		const messages = [createSampleMessage("Test message")]
		const { container } = render(
			<QueuedMessageList messages={messages} onRemoveMessage={mockOnRemoveMessage} className="custom-class" />,
		)

		expect(container.firstChild).toHaveClass("custom-class")
	})

	it("truncates long message text", () => {
		const longMessage = "This is a very long message that should be truncated when displayed"
		const messages = [createSampleMessage(longMessage)]

		render(<QueuedMessageList messages={messages} onRemoveMessage={mockOnRemoveMessage} />)

		const messageElement = screen.getByText(longMessage)
		expect(messageElement).toHaveClass("truncate")
		expect(messageElement).toHaveAttribute("title", longMessage)
	})
})
