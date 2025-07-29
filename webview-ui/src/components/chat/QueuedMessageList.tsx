// kilocode_change - new file
import { motion } from "framer-motion"
import { useState, useRef, useLayoutEffect, useCallback } from "react"
import { ChevronRight, Play, Pause } from "lucide-react"
import type { QueuedMessage } from "./hooks/useQueuedMessages"
import { QueuedMessageRow } from "./QueuedMessageRow"
import { IconButton } from "../ui/IconButton"
import { cn } from "@/lib/utils"

const maxHeight = 100 // roughly 4 messages worth of height

interface QueuedMessageListProps {
	messages: QueuedMessage[]
	onRemoveMessage: (messageId: string) => void
	onEditMessage: (messageId: string) => void
	isQueuePaused: boolean
	onResumeQueue: () => void
	onPauseQueue: () => void
	className?: string
}

export function QueuedMessageList({
	messages,
	onRemoveMessage,
	onEditMessage,
	isQueuePaused,
	onResumeQueue,
	onPauseQueue,
	className,
}: QueuedMessageListProps) {
	const [isOpen, setIsOpen] = useState(true)
	const contentRef = useRef<HTMLDivElement>(null)
	const [contentHeight, setContentHeight] = useState(0)

	const togglePauseQueue = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			if (isQueuePaused) {
				onResumeQueue()
			} else {
				onPauseQueue()
			}
		},
		[isQueuePaused, onPauseQueue, onResumeQueue],
	)

	// Calculate content height when messages change
	useLayoutEffect(() => {
		setContentHeight((oldHeight) => {
			const newHeight = contentRef.current?.scrollHeight ?? 0
			if (contentRef.current && newHeight > oldHeight) {
				contentRef.current.scrollTop = contentRef.current.scrollHeight
			}
			return newHeight
		})
	}, [messages])

	if (messages.length === 0) {
		return <div className={cn("mx-2 pb-2", className)}></div>
	}

	const messageCount = messages.length
	const messageText = messageCount === 1 ? "message" : "messages"
	const queueStatus = isQueuePaused ? "paused" : "active"

	return (
		<div className={cn("mx-2 mt-1 border border-b-none rounded-t-md bg-vscode-editor-background", className)}>
			<div
				className="flex items-center px-2 py-1 cursor-pointer rounded-t border-b border-vscode-widget-border bg-vscode-editor-background"
				onClick={() => setIsOpen(!isOpen)}>
				<motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
					<ChevronRight size={16} className="text-vscode-descriptionForeground" />
				</motion.div>
				<span className="text-[12px] ml-2 text-vscode-descriptionForeground font-medium select-none">
					{messageCount} {messageText} in queue
				</span>
				<div className="flex items-center ml-auto gap-1" onClick={togglePauseQueue}>
					<span className="text-[11px] text-vscode-charts-orange font-medium">{queueStatus}</span>
					{isQueuePaused ? (
						<IconButton className="ml-1" size="sm" title="Resume queue">
							<Play size={10} className="text-vscode-charts-green" />
						</IconButton>
					) : (
						<IconButton className="ml-1" size="sm" title="Pause queue">
							<Pause size={10} className="text-vscode-charts-orange" />
						</IconButton>
					)}
				</div>
			</div>

			<motion.div
				initial={false}
				animate={{
					height: isOpen ? contentHeight : 0,
					maxHeight: maxHeight,
				}}
				transition={{ duration: 0.2, ease: "easeOut" }}
				className="overflow-y-scroll overflow-x-hidden">
				<div ref={contentRef}>
					{messages.map((message) => (
						<motion.div
							key={message.id}
							layout
							exit={{
								height: 0,
								overflow: "hidden",
								transition: { duration: 0.2 },
							}}
							transition={{
								duration: 0.2,
								ease: "easeOut",
								layout: { duration: 0.3, ease: "easeOut" },
							}}>
							<QueuedMessageRow
								message={message}
								onRemove={() => onRemoveMessage(message.id)}
								onEdit={() => onEditMessage(message.id)}
							/>
						</motion.div>
					))}
				</div>
			</motion.div>
		</div>
	)
}
