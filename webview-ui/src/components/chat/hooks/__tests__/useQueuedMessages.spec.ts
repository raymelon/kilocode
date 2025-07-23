// kilocode_change - new file
import { renderHook, act } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { useQueuedMessages } from "../useQueuedMessages"

describe("useQueuedMessages", () => {
	let mockOnAutoSubmit: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.useFakeTimers()
		mockOnAutoSubmit = vi.fn()
		// Set a fixed starting time for Date.now()
		vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"))
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.clearAllMocks()
	})

	const advanceTime = (ms: number) => {
		vi.advanceTimersByTime(ms)
	}

	it("should auto-submit multiple queued messages sequentially", () => {
		const { result, rerender } = renderHook(
			({ sendingDisabled }) =>
				useQueuedMessages({
					sendingDisabled,
					onAutoSubmit: mockOnAutoSubmit,
				}),
			{ initialProps: { sendingDisabled: true } },
		)

		act(() => {
			result.current.addToQueue("First message", [])
			result.current.addToQueue("Second message", [])
		})

		expect(result.current.queuedMessages).toHaveLength(2)

		rerender({ sendingDisabled: false })

		act(() => {
			advanceTime(100)
		})

		expect(mockOnAutoSubmit).toHaveBeenCalledWith("First message", [])
		expect(result.current.queuedMessages).toHaveLength(1)
		expect(result.current.queuedMessages[0].text).toBe("Second message")

		mockOnAutoSubmit.mockClear()

		rerender({ sendingDisabled: true })
		rerender({ sendingDisabled: false })

		act(() => {
			advanceTime(100)
		})

		expect(mockOnAutoSubmit).toHaveBeenCalledWith("Second message", [])
		expect(result.current.queuedMessages).toHaveLength(0)
	})

	it("should handle rapid busy/idle transitions correctly", () => {
		const { result, rerender } = renderHook(
			({ sendingDisabled }) =>
				useQueuedMessages({
					sendingDisabled,
					onAutoSubmit: mockOnAutoSubmit,
				}),
			{ initialProps: { sendingDisabled: true } },
		)

		act(() => {
			result.current.addToQueue("Message 1", [])
			result.current.addToQueue("Message 2", [])
			result.current.addToQueue("Message 3", [])
		})

		expect(result.current.queuedMessages).toHaveLength(3)

		rerender({ sendingDisabled: false })
		act(() => {
			advanceTime(100)
		})

		expect(mockOnAutoSubmit).toHaveBeenCalledWith("Message 1", [])
		expect(result.current.queuedMessages).toHaveLength(2)
		mockOnAutoSubmit.mockClear()

		rerender({ sendingDisabled: true })
		rerender({ sendingDisabled: false })
		act(() => {
			advanceTime(100)
		})

		expect(mockOnAutoSubmit).toHaveBeenCalledWith("Message 2", [])
		expect(result.current.queuedMessages).toHaveLength(1)
		mockOnAutoSubmit.mockClear()

		rerender({ sendingDisabled: true })
		rerender({ sendingDisabled: false })
		act(() => {
			advanceTime(100)
		})

		expect(mockOnAutoSubmit).toHaveBeenCalledWith("Message 3", [])
		expect(result.current.queuedMessages).toHaveLength(0)
	})

	it("should not auto-submit if agent never becomes idle", () => {
		const { result, rerender } = renderHook(
			({ sendingDisabled }) =>
				useQueuedMessages({
					sendingDisabled,
					onAutoSubmit: mockOnAutoSubmit,
				}),
			{ initialProps: { sendingDisabled: true } },
		)

		act(() => {
			result.current.addToQueue("Message 1", [])
			result.current.addToQueue("Message 2", [])
		})

		rerender({ sendingDisabled: true })

		act(() => {
			advanceTime(1000)
		})

		expect(mockOnAutoSubmit).not.toHaveBeenCalled()
		expect(result.current.queuedMessages).toHaveLength(2)
	})

	it("should clear timeout when component unmounts", () => {
		const { result, unmount, rerender } = renderHook(
			({ sendingDisabled }) =>
				useQueuedMessages({
					sendingDisabled,
					onAutoSubmit: mockOnAutoSubmit,
				}),
			{ initialProps: { sendingDisabled: true } },
		)

		act(() => {
			result.current.addToQueue("Test message", [])
		})

		rerender({ sendingDisabled: false })

		unmount()

		act(() => {
			advanceTime(100)
		})

		expect(mockOnAutoSubmit).not.toHaveBeenCalled()
	})

	it("should handle queue operations correctly", () => {
		const { result } = renderHook(() =>
			useQueuedMessages({
				sendingDisabled: false,
				onAutoSubmit: mockOnAutoSubmit,
			}),
		)

		act(() => {
			result.current.addToQueue("Message 1", ["image1.png"])
			result.current.addToQueue("Message 2", [])
		})

		expect(result.current.queuedMessages).toHaveLength(2)
		expect(result.current.queuedMessages[0].text).toBe("Message 1")
		expect(result.current.queuedMessages[0].images).toEqual(["image1.png"])
		expect(result.current.queuedMessages[1].text).toBe("Message 2")

		const messageId = result.current.queuedMessages[0].id
		act(() => {
			result.current.removeFromQueue(messageId)
		})

		expect(result.current.queuedMessages).toHaveLength(1)
		expect(result.current.queuedMessages[0].text).toBe("Message 2")

		act(() => {
			result.current.clearQueue()
		})

		expect(result.current.queuedMessages).toHaveLength(0)
	})

	it("should handle the specific case where second queued message gets stuck", () => {
		// This test reproduces the exact issue the user reported:
		// 1. Agent starts running
		// 2. User queues two messages
		// 3. First message gets auto-submitted when agent becomes idle
		// 4. Second message should also get auto-submitted when agent becomes idle again

		const { result, rerender } = renderHook(
			({ sendingDisabled }) =>
				useQueuedMessages({
					sendingDisabled,
					onAutoSubmit: mockOnAutoSubmit,
				}),
			{ initialProps: { sendingDisabled: true } }, // Agent starts busy
		)

		act(() => {
			result.current.addToQueue("First queued message", [])
			result.current.addToQueue("Second queued message", [])
		})

		expect(result.current.queuedMessages).toHaveLength(2)

		rerender({ sendingDisabled: false })

		act(() => {
			advanceTime(100)
		})

		expect(mockOnAutoSubmit).toHaveBeenCalledWith("First queued message", [])
		expect(result.current.queuedMessages).toHaveLength(1)
		expect(result.current.queuedMessages[0].text).toBe("Second queued message")

		mockOnAutoSubmit.mockClear()

		rerender({ sendingDisabled: true })
		rerender({ sendingDisabled: false })

		act(() => {
			advanceTime(100)
		})

		expect(mockOnAutoSubmit).toHaveBeenCalledWith("Second queued message", [])
		expect(result.current.queuedMessages).toHaveLength(0)
	})

	describe("paused state functionality", () => {
		it("should initialize with queue active (not paused)", () => {
			const { result } = renderHook(() =>
				useQueuedMessages({
					sendingDisabled: false,
					onAutoSubmit: mockOnAutoSubmit,
				}),
			)

			expect(result.current.isQueuePaused).toBe(false)
		})

		it("should pause and resume queue correctly", () => {
			const { result } = renderHook(() =>
				useQueuedMessages({
					sendingDisabled: false,
					onAutoSubmit: mockOnAutoSubmit,
				}),
			)

			act(() => {
				result.current.pauseQueue()
			})

			expect(result.current.isQueuePaused).toBe(true)

			act(() => {
				result.current.resumeQueue()
			})

			expect(result.current.isQueuePaused).toBe(false)
		})

		it("should not auto-submit when queue is paused", () => {
			const { result, rerender } = renderHook(
				({ sendingDisabled }) =>
					useQueuedMessages({
						sendingDisabled,
						onAutoSubmit: mockOnAutoSubmit,
					}),
				{ initialProps: { sendingDisabled: true } },
			)

			act(() => {
				result.current.addToQueue("Test message", [])
				result.current.pauseQueue()
			})

			rerender({ sendingDisabled: false })

			act(() => {
				advanceTime(100)
			})

			expect(mockOnAutoSubmit).not.toHaveBeenCalled()
			expect(result.current.queuedMessages).toHaveLength(1)
		})

		it("should auto-submit when queue is resumed", () => {
			const { result, rerender } = renderHook(
				({ sendingDisabled }) =>
					useQueuedMessages({
						sendingDisabled,
						onAutoSubmit: mockOnAutoSubmit,
					}),
				{ initialProps: { sendingDisabled: true } },
			)

			act(() => {
				result.current.addToQueue("Test message", [])
				result.current.pauseQueue()
			})

			rerender({ sendingDisabled: false })

			act(() => {
				advanceTime(100)
			})

			expect(mockOnAutoSubmit).not.toHaveBeenCalled()

			act(() => {
				result.current.resumeQueue()
			})

			act(() => {
				advanceTime(100)
			})

			expect(mockOnAutoSubmit).toHaveBeenCalledWith("Test message", [])
			expect(result.current.queuedMessages).toHaveLength(0)
		})

		it("should handle pause/resume with multiple messages", () => {
			const { result, rerender } = renderHook(
				({ sendingDisabled }) =>
					useQueuedMessages({
						sendingDisabled,
						onAutoSubmit: mockOnAutoSubmit,
					}),
				{ initialProps: { sendingDisabled: true } },
			)

			act(() => {
				result.current.addToQueue("Message 1", [])
				result.current.addToQueue("Message 2", [])
				result.current.pauseQueue()
			})

			rerender({ sendingDisabled: false })

			act(() => {
				advanceTime(100)
			})

			expect(mockOnAutoSubmit).not.toHaveBeenCalled()
			expect(result.current.queuedMessages).toHaveLength(2)

			act(() => {
				result.current.resumeQueue()
			})

			act(() => {
				advanceTime(100)
			})

			expect(mockOnAutoSubmit).toHaveBeenCalledWith("Message 1", [])
			expect(result.current.queuedMessages).toHaveLength(1)
		})

		it("should respect both sendingDisabled and paused state", () => {
			const { result, rerender } = renderHook(
				({ sendingDisabled }) =>
					useQueuedMessages({
						sendingDisabled,
						onAutoSubmit: mockOnAutoSubmit,
					}),
				{ initialProps: { sendingDisabled: true } },
			)

			act(() => {
				result.current.addToQueue("Test message", [])
			})

			// Queue is active but agent is busy
			rerender({ sendingDisabled: false })

			act(() => {
				advanceTime(100)
			})

			expect(mockOnAutoSubmit).toHaveBeenCalledWith("Test message", [])
			mockOnAutoSubmit.mockClear()

			act(() => {
				result.current.addToQueue("Second message", [])
				result.current.pauseQueue()
			})

			// Queue is paused and agent is idle - should not submit
			act(() => {
				advanceTime(100)
			})

			expect(mockOnAutoSubmit).not.toHaveBeenCalled()

			// Queue is paused and agent becomes busy - still should not submit
			rerender({ sendingDisabled: true })

			act(() => {
				advanceTime(100)
			})

			expect(mockOnAutoSubmit).not.toHaveBeenCalled()

			// Resume queue but agent is still busy - should not submit
			act(() => {
				result.current.resumeQueue()
			})

			act(() => {
				advanceTime(100)
			})

			expect(mockOnAutoSubmit).not.toHaveBeenCalled()

			// Agent becomes idle and queue is active - should submit
			rerender({ sendingDisabled: false })

			act(() => {
				advanceTime(100)
			})

			expect(mockOnAutoSubmit).toHaveBeenCalledWith("Second message", [])
		})

		it("should handle cancel/intercept scenario correctly", () => {
			// This test simulates the user's scenario:
			// 1. Agent is running
			// 2. User cancels and queues a message
			// 3. Queue should be paused to prevent auto-processing
			// 4. User can manually resume when ready

			const { result, rerender } = renderHook(
				({ sendingDisabled }) =>
					useQueuedMessages({
						sendingDisabled,
						onAutoSubmit: mockOnAutoSubmit,
					}),
				{ initialProps: { sendingDisabled: true } }, // Agent is running
			)

			// User cancels and adds message to queue, then pauses (simulating cancel behavior)
			act(() => {
				result.current.addToQueue("Intercepted message", [])
				result.current.pauseQueue() // This would be called by cancel handler
			})

			// Agent becomes idle but queue is paused
			rerender({ sendingDisabled: false })

			act(() => {
				advanceTime(100)
			})

			expect(mockOnAutoSubmit).not.toHaveBeenCalled()
			expect(result.current.queuedMessages).toHaveLength(1)
			expect(result.current.isQueuePaused).toBe(true)

			// User manually resumes queue when ready
			act(() => {
				result.current.resumeQueue()
			})

			act(() => {
				advanceTime(100)
			})

			expect(mockOnAutoSubmit).toHaveBeenCalledWith("Intercepted message", [])
			expect(result.current.queuedMessages).toHaveLength(0)
			expect(result.current.isQueuePaused).toBe(false)
		})

		it("should preserve queue when manually sending messages", () => {
			// This test ensures that manually sending a message doesn't clear the queue
			const { result, rerender } = renderHook(
				({ sendingDisabled }) =>
					useQueuedMessages({
						sendingDisabled,
						onAutoSubmit: mockOnAutoSubmit,
					}),
				{ initialProps: { sendingDisabled: true } },
			)

			// Add messages to queue and pause it (simulating cancel scenario)
			act(() => {
				result.current.addToQueue("Queued message 1", [])
				result.current.addToQueue("Queued message 2", [])
				result.current.pauseQueue()
			})

			expect(result.current.queuedMessages).toHaveLength(2)
			expect(result.current.isQueuePaused).toBe(true)

			// Agent becomes idle but queue is paused
			rerender({ sendingDisabled: false })

			act(() => {
				advanceTime(100)
			})

			// No auto-submission because queue is paused
			expect(mockOnAutoSubmit).not.toHaveBeenCalled()
			expect(result.current.queuedMessages).toHaveLength(2)

			// User manually resumes queue (simulating sending a new message)
			act(() => {
				result.current.resumeQueue()
			})

			// Queue should still have the original messages and start processing
			expect(result.current.queuedMessages).toHaveLength(2)
			expect(result.current.isQueuePaused).toBe(false)

			act(() => {
				advanceTime(100)
			})

			// First queued message should be processed
			expect(mockOnAutoSubmit).toHaveBeenCalledWith("Queued message 1", [])
			expect(result.current.queuedMessages).toHaveLength(1)
			expect(result.current.queuedMessages[0].text).toBe("Queued message 2")
		})
	})
})
