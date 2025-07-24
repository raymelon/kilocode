// kilocode_change - new file
import { useCallback, useState, useEffect, useRef } from "react"

export interface QueuedMessage {
	id: string
	text: string
	images: string[]
	timestamp: number
}

interface UseQueuedMessagesProps {
	canSendNextMessage: boolean
	handleSendMessage: (text: string, images: string[]) => void
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

export function useQueuedMessages({
	canSendNextMessage,
	handleSendMessage,
}: UseQueuedMessagesProps): UseQueuedMessagesReturn {
	const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([])
	const [isQueuePaused, setIsQueuePaused] = useState(false)
	const timeoutRef = useRef<NodeJS.Timeout | null>(null)

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

	const resumeQueue = useCallback(() => {
		setIsQueuePaused(false)
	}, [])

	// Auto-submit when it's safe to send and there are queued messages (only if queue is not paused)
	useEffect(() => {
		clearTimeout(timeoutRef.current ?? undefined)
		timeoutRef.current = null

		if (canSendNextMessage && !isQueuePaused && queuedMessages.length > 0) {
			timeoutRef.current = setTimeout(() => {
				setQueuedMessages((prevQueue) => {
					const nextMessage = prevQueue[0]
					if (nextMessage) {
						handleSendMessage(nextMessage.text, nextMessage.images)
						return prevQueue.slice(1)
					}
					return prevQueue
				})
			}, 500) // prevent double sends by waiting a bit
		}

		return () => {
			clearTimeout(timeoutRef.current ?? undefined)
			timeoutRef.current = null
		}
	}, [canSendNextMessage, isQueuePaused, queuedMessages.length, handleSendMessage])

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
