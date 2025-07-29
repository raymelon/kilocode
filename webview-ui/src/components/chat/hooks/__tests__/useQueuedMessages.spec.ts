import { renderHook, act } from "@testing-library/react"
import { useQueuedMessages } from "../useQueuedMessages"
import type { ClineMessage, ClineAsk, ClineSay } from "@roo-code/types"
import { vi } from "vitest"

describe("useQueuedMessages", () => {
	let mockHandleSendMessage: ReturnType<typeof vi.fn>
	let mockHandleSendMessageRef: React.MutableRefObject<(text: string, images: string[]) => void>
	let messages: ClineMessage[]

	beforeEach(() => {
		mockHandleSendMessage = vi.fn()
		mockHandleSendMessageRef = { current: mockHandleSendMessage }
		messages = []
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.clearAllMocks()
	})

	const createCompletionMessage = (
		type: "say" | "ask" = "ask",
		askType: ClineAsk = "completion_result",
		sayType?: ClineSay,
	): ClineMessage => ({
		ts: Date.now(),
		type,
		...(type === "ask" ? { ask: askType } : { say: sayType }),
		text: "",
	})

	it("should initialize with empty queue", () => {
		const { result } = renderHook(() => useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }))

		expect(result.current.queuedMessages).toEqual([])
		expect(result.current.isQueuePaused).toBe(false)
	})

	it("should add messages to queue", () => {
		const { result } = renderHook(() => useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }))

		act(() => {
			result.current.addToQueue("test message", [])
		})

		expect(result.current.queuedMessages).toHaveLength(1)
		expect(result.current.queuedMessages[0].text).toBe("test message")
	})

	it("should add messages to front of queue", () => {
		const { result } = renderHook(() => useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }))

		act(() => {
			result.current.addToQueue("first message", [])
			result.current.addToQueueAtFront("priority message", [])
		})

		expect(result.current.queuedMessages).toHaveLength(2)
		expect(result.current.queuedMessages[0].text).toBe("priority message")
		expect(result.current.queuedMessages[1].text).toBe("first message")
	})

	it("should process queue with cooldown when agent completion message is received", () => {
		const { result, rerender } = renderHook(
			({ messages }) => useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }),
			{ initialProps: { messages } },
		)

		// Add messages to queue
		act(() => {
			result.current.addToQueue("message 1", [])
			result.current.addToQueue("message 2", [])
		})

		expect(result.current.queuedMessages).toHaveLength(2)

		// Simulate agent completion message
		const completionMessage = createCompletionMessage()
		messages = [completionMessage]

		act(() => {
			rerender({ messages })
		})

		// Message should not be sent immediately due to cooldown
		expect(mockHandleSendMessage).not.toHaveBeenCalled()
		expect(result.current.queuedMessages).toHaveLength(2)

		// Fast-forward past cooldown period
		act(() => {
			vi.advanceTimersByTime(1000)
		})

		// Now the first message should be sent and removed from queue
		expect(mockHandleSendMessage).toHaveBeenCalledWith("message 1", [])
		expect(result.current.queuedMessages).toHaveLength(1)
		expect(result.current.queuedMessages[0].text).toBe("message 2")
	})

	it("should respect cooldown period between messages", () => {
		const { result, rerender } = renderHook(
			({ messages }) => useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }),
			{ initialProps: { messages } },
		)

		// Add messages to queue
		act(() => {
			result.current.addToQueue("message 1", [])
			result.current.addToQueue("message 2", [])
		})

		// Send first completion message
		messages = [createCompletionMessage()]
		act(() => {
			rerender({ messages })
		})

		// Fast-forward past cooldown for first message
		act(() => {
			vi.advanceTimersByTime(1000)
		})

		expect(mockHandleSendMessage).toHaveBeenCalledTimes(1)
		expect(mockHandleSendMessage).toHaveBeenCalledWith("message 1", [])

		// Send second completion message immediately after first was sent
		messages = [...messages, createCompletionMessage()]
		act(() => {
			rerender({ messages })
		})

		// Should not send immediately due to cooldown
		expect(mockHandleSendMessage).toHaveBeenCalledTimes(1)

		// Fast-forward past cooldown for second message
		act(() => {
			vi.advanceTimersByTime(1000)
		})

		expect(mockHandleSendMessage).toHaveBeenCalledTimes(2)
		expect(mockHandleSendMessage).toHaveBeenLastCalledWith("message 2", [])
	})

	it("should not process queue when paused", () => {
		const { result, rerender } = renderHook(
			({ messages }) => useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }),
			{ initialProps: { messages } },
		)

		act(() => {
			result.current.addToQueue("test message", [])
			result.current.pauseQueue()
		})

		// Simulate agent completion message
		messages = [createCompletionMessage()]
		act(() => {
			rerender({ messages })
			vi.advanceTimersByTime(1000)
		})

		expect(mockHandleSendMessage).not.toHaveBeenCalled()
		expect(result.current.queuedMessages).toHaveLength(1)
	})

	it("should resume processing when queue is resumed", () => {
		const { result, rerender } = renderHook(
			({ messages }) => useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }),
			{ initialProps: { messages } },
		)

		act(() => {
			result.current.addToQueue("test message", [])
			result.current.pauseQueue()
		})

		// Simulate agent completion message while paused
		messages = [createCompletionMessage()]
		act(() => {
			rerender({ messages })
			vi.advanceTimersByTime(1000)
		})

		expect(mockHandleSendMessage).not.toHaveBeenCalled()

		// Resume queue
		act(() => {
			result.current.resumeQueue()
		})

		// Should process immediately since completion message was already received
		act(() => {
			vi.advanceTimersByTime(1000)
		})

		expect(mockHandleSendMessage).toHaveBeenCalledWith("test message", [])
	})

	it("should clear queue", () => {
		const { result } = renderHook(() => useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }))

		act(() => {
			result.current.addToQueue("message 1", [])
			result.current.addToQueue("message 2", [])
		})

		expect(result.current.queuedMessages).toHaveLength(2)

		act(() => {
			result.current.clearQueue()
		})

		expect(result.current.queuedMessages).toHaveLength(0)
	})

	it("should remove specific message from queue", () => {
		const { result } = renderHook(() => useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }))

		act(() => {
			result.current.addToQueue("message 1", [])
			result.current.addToQueue("message 2", [])
		})

		const messageId = result.current.queuedMessages[0].id

		act(() => {
			result.current.removeFromQueue(messageId)
		})

		expect(result.current.queuedMessages).toHaveLength(1)
		expect(result.current.queuedMessages[0].text).toBe("message 2")
	})

	it("should auto-send queued messages only on completion_result ask messages", () => {
		const testMockHandleSendMessage = vi.fn()

		const { result, rerender } = renderHook(
			({ messages }: { messages: ClineMessage[] }) =>
				useQueuedMessages({ messages, onSendMessageRef: { current: testMockHandleSendMessage } }),
			{ initialProps: { messages: [] as ClineMessage[] } },
		)

		act(() => {
			result.current.addToQueue("test message", [])
		})

		// Test that completion_result ask message triggers auto-send
		const completionMessage: ClineMessage = {
			ts: Date.now(),
			type: "ask",
			ask: "completion_result",
			text: "",
		}

		act(() => {
			rerender({ messages: [completionMessage] })
		})

		// Advance timers to trigger the auto-send
		act(() => {
			vi.advanceTimersByTime(1000)
		})

		expect(testMockHandleSendMessage).toHaveBeenCalledWith("test message", [])
	})

	it("should not auto-send queued messages on other message types", () => {
		const nonCompletionTypes = [
			{ type: "say" as const, say: "api_req_finished" as ClineSay },
			{ type: "say" as const, say: "command_output" as ClineSay },
			{ type: "ask" as const, ask: "command_output" as ClineAsk },
			{ type: "ask" as const, ask: "resume_task" as ClineAsk },
		]

		nonCompletionTypes.forEach(({ type, say, ask }, index) => {
			const testMockHandleSendMessage = vi.fn()

			const { result, rerender } = renderHook(
				({ messages }: { messages: ClineMessage[] }) =>
					useQueuedMessages({ messages, onSendMessageRef: { current: testMockHandleSendMessage } }),
				{ initialProps: { messages: [] as ClineMessage[] } },
			)

			act(() => {
				result.current.addToQueue(`test message ${index}`, [])
			})

			const message: ClineMessage =
				type === "say"
					? {
							ts: Date.now(),
							type: "say",
							say,
							text: "",
						}
					: {
							ts: Date.now(),
							type: "ask",
							ask,
							text: "",
						}

			act(() => {
				rerender({ messages: [message] })
			})

			// Advance timers
			act(() => {
				vi.advanceTimersByTime(1000)
			})

			// Should NOT auto-send for these message types
			expect(testMockHandleSendMessage).not.toHaveBeenCalled()
		})
	})

	it("should not create race conditions when processing multiple messages quickly", () => {
		const { result, rerender } = renderHook(
			({ messages }: { messages: ClineMessage[] }) =>
				useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }),
			{ initialProps: { messages: [] as ClineMessage[] } },
		)

		// Add multiple messages to queue
		act(() => {
			result.current.addToQueue("message 1", [])
			result.current.addToQueue("message 2", [])
			result.current.addToQueue("message 3", [])
		})

		expect(result.current.queuedMessages).toHaveLength(3)

		// Send completion message to trigger processing
		const completionMessage = createCompletionMessage()
		act(() => {
			rerender({ messages: [completionMessage] })
		})

		// Fast-forward past cooldown
		act(() => {
			vi.advanceTimersByTime(1000)
		})

		// Should have sent exactly one message
		expect(mockHandleSendMessage).toHaveBeenCalledTimes(1)
		expect(mockHandleSendMessage).toHaveBeenCalledWith("message 1", [])
		expect(result.current.queuedMessages).toHaveLength(2)

		// Send another completion message
		const completionMessage2 = createCompletionMessage()
		act(() => {
			rerender({ messages: [completionMessage, completionMessage2] })
		})

		// Fast-forward past cooldown
		act(() => {
			vi.advanceTimersByTime(1000)
		})

		// Should have sent exactly two messages total
		expect(mockHandleSendMessage).toHaveBeenCalledTimes(2)
		expect(mockHandleSendMessage).toHaveBeenLastCalledWith("message 2", [])
		expect(result.current.queuedMessages).toHaveLength(1)
	})

	it("should maintain correct order when messages are added while processing", () => {
		const { result, rerender } = renderHook(
			({ messages }: { messages: ClineMessage[] }) =>
				useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }),
			{ initialProps: { messages: [] as ClineMessage[] } },
		)

		// Add first message
		act(() => {
			result.current.addToQueue("first", [])
		})

		// Trigger processing with completion message
		const completionMessage1 = createCompletionMessage()
		act(() => {
			rerender({ messages: [completionMessage1] })
		})

		// Add second message while first is in cooldown
		act(() => {
			result.current.addToQueue("second", [])
		})

		// Add third message
		act(() => {
			result.current.addToQueue("third", [])
		})

		// Fast-forward past cooldown for first message
		act(() => {
			vi.advanceTimersByTime(1000)
		})

		// First message should be sent
		expect(mockHandleSendMessage).toHaveBeenCalledTimes(1)
		expect(mockHandleSendMessage).toHaveBeenCalledWith("first", [])
		expect(result.current.queuedMessages).toHaveLength(2)
		expect(result.current.queuedMessages[0].text).toBe("second")
		expect(result.current.queuedMessages[1].text).toBe("third")

		// Trigger processing for second message
		const completionMessage2 = createCompletionMessage()
		act(() => {
			rerender({ messages: [completionMessage1, completionMessage2] })
		})

		// Fast-forward past cooldown for second message
		act(() => {
			vi.advanceTimersByTime(1000)
		})

		// Second message should be sent
		expect(mockHandleSendMessage).toHaveBeenCalledTimes(2)
		expect(mockHandleSendMessage).toHaveBeenLastCalledWith("second", [])
		expect(result.current.queuedMessages).toHaveLength(1)
		expect(result.current.queuedMessages[0].text).toBe("third")
	})

	it("should handle rapid message additions with mixed addToQueue and addToQueueAtFront", () => {
		const { result, rerender } = renderHook(
			({ messages }: { messages: ClineMessage[] }) =>
				useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }),
			{ initialProps: { messages: [] as ClineMessage[] } },
		)

		// Simulate the scenario from the logs: messages "2", "3", "4"
		act(() => {
			result.current.addToQueue("2", [])
			result.current.addToQueue("3", [])
			result.current.addToQueue("4", [])
		})

		// Queue should be ["2", "3", "4"]
		expect(result.current.queuedMessages.map((m) => m.text)).toEqual(["2", "3", "4"])

		// Now simulate someone using addToQueueAtFront (like the interjection feature)
		act(() => {
			result.current.addToQueueAtFront("1", [])
		})

		// Queue should now be ["1", "2", "3", "4"]
		expect(result.current.queuedMessages.map((m) => m.text)).toEqual(["1", "2", "3", "4"])

		// Trigger processing
		const completionMessage = createCompletionMessage()
		act(() => {
			rerender({ messages: [completionMessage] })
		})

		// Fast-forward past cooldown
		act(() => {
			vi.advanceTimersByTime(1000)
		})

		// Should send "1" first (was added to front)
		expect(mockHandleSendMessage).toHaveBeenCalledTimes(1)
		expect(mockHandleSendMessage).toHaveBeenCalledWith("1", [])
		expect(result.current.queuedMessages.map((m) => m.text)).toEqual(["2", "3", "4"])

		// Continue processing
		const completionMessage2 = createCompletionMessage()
		act(() => {
			rerender({ messages: [completionMessage, completionMessage2] })
		})

		act(() => {
			vi.advanceTimersByTime(1000)
		})

		// Should send "2" next
		expect(mockHandleSendMessage).toHaveBeenCalledTimes(2)
		expect(mockHandleSendMessage).toHaveBeenLastCalledWith("2", [])
		expect(result.current.queuedMessages.map((m) => m.text)).toEqual(["3", "4"])
	})

	it("should reproduce the race condition bug from logs", () => {
		const { result, rerender } = renderHook(
			({ messages }: { messages: ClineMessage[] }) =>
				useQueuedMessages({ messages, onSendMessageRef: mockHandleSendMessageRef }),
			{ initialProps: { messages: [] as ClineMessage[] } },
		)

		// Add initial messages like in the logs
		act(() => {
			result.current.addToQueue("2", [])
			result.current.addToQueue("3", [])
			result.current.addToQueue("4", [])
		})

		expect(result.current.queuedMessages.map((m) => m.text)).toEqual(["2", "3", "4"])

		// Trigger processing with completion message
		const completionMessage1 = createCompletionMessage()
		act(() => {
			rerender({ messages: [completionMessage1] })
		})

		// This should NOT cause new messages to be added while processing
		// But based on the logs, it seems like messages are being added during processing

		// Fast-forward past cooldown
		act(() => {
			vi.advanceTimersByTime(1000)
		})

		// Should have sent exactly one message
		expect(mockHandleSendMessage).toHaveBeenCalledTimes(1)
		expect(mockHandleSendMessage).toHaveBeenCalledWith("2", [])

		// Queue should have 2 remaining messages, not 3 (no duplicates should be added)
		expect(result.current.queuedMessages.map((m) => m.text)).toEqual(["3", "4"])

		// The bug from logs shows that "2" gets added again after being sent
		// This test should fail if that bug exists
	})

	it("should handle the case where handleSendMessage triggers adding more messages", () => {
		// Create a mock that adds messages back to the queue when called
		const mockHandleSendMessageWithSideEffect = vi.fn((text: string) => {
			// Simulate the bug: when we send a message, it somehow gets added back to the queue
			if (text === "2") {
				// This simulates what might be happening in the real app
				setTimeout(() => {
					result.current.addToQueue("2", [])
				}, 0)
			}
		})

		const { result, rerender } = renderHook(
			({ messages }: { messages: ClineMessage[] }) =>
				useQueuedMessages({
					messages,
					onSendMessageRef: { current: mockHandleSendMessageWithSideEffect },
				}),
			{ initialProps: { messages: [] as ClineMessage[] } },
		)

		// Add initial messages
		act(() => {
			result.current.addToQueue("2", [])
			result.current.addToQueue("3", [])
			result.current.addToQueue("4", [])
		})

		expect(result.current.queuedMessages.map((m) => m.text)).toEqual(["2", "3", "4"])

		// Trigger processing
		const completionMessage = createCompletionMessage()
		act(() => {
			rerender({ messages: [completionMessage] })
		})

		// Fast-forward past cooldown
		act(() => {
			vi.advanceTimersByTime(1000)
		})

		// Process any pending async operations (like the setTimeout in the mock)
		act(() => {
			vi.runAllTimers()
		})

		// This should reveal the bug: "2" gets added back to the queue

		// If the bug exists, we'll see "2" added back to the queue
		// This test might fail or show unexpected behavior
	})
})
