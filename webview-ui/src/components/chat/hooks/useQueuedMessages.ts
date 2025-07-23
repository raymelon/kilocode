// kilocode_change - new file
import { useCallback, useState, useEffect } from "react"

export interface QueuedMessage {
	id: string
	text: string
	images: string[]
	timestamp: number
}

interface UseQueuedMessagesProps {
	sendingDisabled: boolean
	onAutoSubmit: (message: string, images: string[]) => void
}

interface UseQueuedMessagesReturn {
	queuedMessages: QueuedMessage[]
	addToQueue: (text: string, images: string[]) => void
	removeFromQueue: (messageId: string) => void
	clearQueue: () => void
	processNextMessage: () => void
	pauseQueue: () => void
	resumeQueue: () => void
	isQueuePaused: boolean
}

export function useQueuedMessages({ sendingDisabled, onAutoSubmit }: UseQueuedMessagesProps): UseQueuedMessagesReturn {
	const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([])
	const [isQueuePaused, setIsQueuePaused] = useState(false)

	const addToQueue = useCallback((text: string, images: string[] = []) => {
		const message: QueuedMessage = {
			id: crypto.randomUUID(),
			text: text.trim(),
			images: [...images],
			timestamp: Date.now(),
		}
		setQueuedMessages((prevQueue) => [...prevQueue, message])
	}, [])

	const removeFromQueue = useCallback((messageId: string) => {
		setQueuedMessages((prevQueue) => prevQueue.filter((msg) => msg.id !== messageId))
	}, [])

	const clearQueue = useCallback(() => {
		setQueuedMessages([])
	}, [])

	const processNextMessage = useCallback(() => {
		setQueuedMessages((prevQueue) => prevQueue.slice(1))
	}, [])

	const pauseQueue = useCallback(() => {
		setIsQueuePaused(true)
	}, [])

	const resumeQueue = useCallback(() => {
		setIsQueuePaused(false)
	}, [])

	// Auto-submit when agent becomes idle and there are queued messages (only if queue is not paused)
	useEffect(() => {
		if (!sendingDisabled && !isQueuePaused && queuedMessages.length > 0) {
			const nextMessage = queuedMessages[0]
			if (nextMessage && (nextMessage.text || nextMessage.images.length > 0)) {
				// Use setTimeout to avoid synchronous state updates
				const timeoutId = setTimeout(() => {
					onAutoSubmit(nextMessage.text, nextMessage.images)
					processNextMessage()
				}, 100)

				return () => clearTimeout(timeoutId)
			}
		}
	}, [sendingDisabled, isQueuePaused, queuedMessages, onAutoSubmit, processNextMessage])

	return {
		queuedMessages,
		addToQueue,
		removeFromQueue,
		clearQueue,
		processNextMessage,
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
