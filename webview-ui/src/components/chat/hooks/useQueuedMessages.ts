// kilocode_change - new file
import { useCallback, useState, useEffect, useRef } from "react"
import type { ClineMessage } from "@roo-code/types"

// Cooldown period to prevent rapid-fire sending
const COOLDOWN_MS = 1000

// Agent completion events that indicate readiness for next message
// These are "say" messages that indicate the agent has finished processing and is ready for new input

export interface QueuedMessage {
	id: string
	text: string
	images: string[]
	timestamp: number
}

interface UseQueuedMessagesProps {
	messages: ClineMessage[]
	onSendMessageRef: React.MutableRefObject<(text: string, images: string[]) => void>
}

interface UseQueuedMessagesReturn {
	queuedMessages: QueuedMessage[]
	addToQueue: (text: string, images: string[]) => void
	addToQueueAtFront: (text: string, images: string[]) => void
	removeFromQueue: (messageId: string) => void
	clearQueue: () => void
	pauseQueue: () => void
	resumeQueue: () => void
	isQueuePaused: boolean
}

export function useQueuedMessages({ messages, onSendMessageRef }: UseQueuedMessagesProps): UseQueuedMessagesReturn {
	const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([])
	const [isQueuePaused, setIsQueuePaused] = useState(false)
	const timeoutRef = useRef<NodeJS.Timeout | null>(null)
	const lastSentTimestampRef = useRef<number>(0)

	const createQueuedMessage = useCallback((text: string, images: string[] = []): QueuedMessage => {
		return {
			id: crypto.randomUUID(),
			text: text.trim(),
			images: [...images],
			timestamp: Date.now(),
		}
	}, [])

	const addToQueue = useCallback(
		(text: string, images: string[] = []) => {
			const message = createQueuedMessage(text, images)
			setQueuedMessages((prevQueue) => [...prevQueue, message])
		},
		[createQueuedMessage],
	)

	const addToQueueAtFront = useCallback(
		(text: string, images: string[] = []) => {
			const message = createQueuedMessage(text, images)
			setQueuedMessages((prevQueue) => [message, ...prevQueue])
		},
		[createQueuedMessage],
	)

	const removeFromQueue = useCallback((messageId: string) => {
		setQueuedMessages((prevQueue) => prevQueue.filter((msg) => msg.id !== messageId))
	}, [])

	const clearQueue = useCallback(() => {
		setQueuedMessages([])
	}, [])

	const pauseQueue = useCallback(() => {
		setIsQueuePaused(true)
	}, [])

	// Helper function to check if a message indicates agent completion
	// ONLY send when the "Start New Task" button would be showing
	const isAgentCompletionMessage = useCallback(
		(clineMessage: ClineMessage) =>
			clineMessage.type === "ask" && !clineMessage.partial && clineMessage.ask === "completion_result",
		[],
	)

	const resumeQueue = useCallback(() => {
		setIsQueuePaused(false)

		// Check if we should immediately send the first message when resuming
		// This handles the case where the agent isn't running and we unpause
		if (queuedMessages.length > 0) {
			const nextMessage = queuedMessages[0]
			setQueuedMessages((prevQueue) => {
				onSendMessageRef.current?.(nextMessage.text, nextMessage.images)
				lastSentTimestampRef.current = Date.now()
				return prevQueue.slice(1)
			})
		}
	}, [queuedMessages, onSendMessageRef])

	// Debug useEffect to log every lastMessage change
	// useEffect(() => {
	// 	if (messages.length === 0) {
	// 		return
	// 	}

	// 	const lastMessage = messages[messages.length - 1]
	// 	console.log(`🔍 lastMessage changed:`, {
	// 		type: lastMessage?.type,
	// 		say: lastMessage?.say,
	// 		ask: lastMessage?.ask,
	// 		partial: lastMessage?.partial,
	// 		timestamp: new Date().toISOString(),
	// 		messageLength: messages.length,
	// 	})
	// }, [messages])

	const getNextAutoSendMessage = useCallback(() => {
		const lastMessage = messages[messages.length - 1]
		if (isQueuePaused || !lastMessage || !isAgentCompletionMessage(lastMessage)) {
			return null
		}
		return queuedMessages[0]
	}, [isAgentCompletionMessage, isQueuePaused, messages, queuedMessages])

	// Auto-process queue when agent completion events are detected
	useEffect(() => {
		const nextAutoMessage = getNextAutoSendMessage()
		if (!nextAutoMessage) {
			return
		}

		clearTimeout(timeoutRef?.current ?? undefined)
		timeoutRef.current = null

		const now = Date.now()
		const timeSinceLastSent = now - lastSentTimestampRef.current
		const remainingCooldown = Math.max(0, COOLDOWN_MS - timeSinceLastSent)
		const stabilityDelay = 500 // 500ms delay to ensure state is stable
		const totalDelay = Math.max(remainingCooldown, stabilityDelay)

		console.log(`🚀 Agent completion detected! Setting up message send with 500ms stability delay...`)
		timeoutRef.current = setTimeout(() => {
			const nextAutoMessage = getNextAutoSendMessage()
			if (!nextAutoMessage) {
				return
			}

			console.log(`🚀 State still ready after delay - proceeding with send!`, nextAutoMessage)
			setQueuedMessages((prevQueue) => {
				onSendMessageRef.current?.(nextAutoMessage.text, nextAutoMessage.images)
				lastSentTimestampRef.current = Date.now()
				return prevQueue.slice(1)
			})
		}, totalDelay)

		return () => {
			clearTimeout(timeoutRef?.current ?? undefined)
			timeoutRef.current = null
		}
	}, [
		messages,
		isQueuePaused,
		queuedMessages.length,
		isAgentCompletionMessage,
		onSendMessageRef,
		getNextAutoSendMessage,
	])

	return {
		queuedMessages,
		addToQueue,
		addToQueueAtFront,
		removeFromQueue,
		clearQueue,
		pauseQueue,
		resumeQueue,
		isQueuePaused,
	}
}

export function createSampleMessage(text: string, images: string[] = []): QueuedMessage {
	return {
		id: crypto.randomUUID(),
		text: text.trim(),
		images: [...images],
		timestamp: Date.now(),
	}
}
