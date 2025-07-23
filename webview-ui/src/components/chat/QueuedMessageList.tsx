// kilocode_change - new file
import { motion, AnimatePresence } from "framer-motion"
import { useState, useRef, useEffect } from "react"
import { ChevronRight, Play } from "lucide-react"
import type { QueuedMessage } from "./hooks/useQueuedMessages"
import { QueuedMessageRow } from "./QueuedMessageRow"
import { cn } from "@/lib/utils"

interface QueuedMessageListProps {
	messages: QueuedMessage[]
	onRemoveMessage: (messageId: string) => void
	isQueuePaused?: boolean
	onResumeQueue?: () => void
	className?: string
}

export function QueuedMessageList({
	messages,
	onRemoveMessage,
	isQueuePaused = false,
	onResumeQueue,
	className,
}: QueuedMessageListProps) {
	const [isOpen, setIsOpen] = useState(true)
	const contentRef = useRef<HTMLDivElement>(null)
	const [contentHeight, setContentHeight] = useState(0)

	// Calculate content height when messages change
	useEffect(() => {
		if (contentRef.current) {
			setContentHeight(contentRef.current.scrollHeight)
		}
	}, [messages])

	if (messages.length === 0) {
		return <div className={cn("mx-2 pb-2", className)}></div>
	}

	const messageCount = messages.length
	const messageText = messageCount === 1 ? "message" : "messages"
	const queueStatus = isQueuePaused ? "paused" : "active"
	const maxHeight = 100 // roughly 4 messages worth of height

	return (
		<div className={cn("mx-2 mt-1 pb-2 border border-b-none rounded-md", className)}>
			<div
				className="flex items-center px-2 py-1 cursor-pointer rounded-t border-b border-vscode-widget-border bg-vscode-editor-background"
				onClick={() => setIsOpen(!isOpen)}>
				<motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
					<ChevronRight size={16} className="text-vscode-descriptionForeground" />
				</motion.div>
				<span className="text-[12px] ml-2 text-vscode-descriptionForeground font-medium select-none">
					{messageCount} {messageText} in queue
				</span>
				{isQueuePaused && (
					<div className="flex items-center ml-auto gap-1">
						<span className="text-[11px] text-vscode-charts-orange font-medium">{queueStatus}</span>
						{onResumeQueue && (
							<button
								onClick={(e) => {
									e.stopPropagation()
									onResumeQueue()
								}}
								className="ml-1 p-1 rounded hover:bg-vscode-button-hoverBackground"
								title="Resume queue">
								<Play size={10} className="text-vscode-charts-green" />
							</button>
						)}
					</div>
				)}
			</div>

			<motion.div
				initial={false}
				animate={{
					height: isOpen ? Math.min(contentHeight, maxHeight) : 0,
				}}
				transition={{
					duration: 0.3,
					ease: "easeInOut",
				}}
				style={{ overflow: "hidden" }}>
				<div
					ref={contentRef}
					className={cn("overflow-y-auto", contentHeight > maxHeight ? "max-h-full" : "")}
					style={{
						maxHeight: contentHeight > maxHeight ? maxHeight : "none",
					}}>
					<AnimatePresence mode="popLayout">
						{messages.map((message) => (
							<motion.div
								key={message.id}
								layout
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{
									opacity: 0,
									transition: { duration: 0.2 },
								}}
								transition={{
									duration: 0.2,
									ease: "easeOut",
									layout: { duration: 0.3, ease: "easeOut" },
								}}>
								<QueuedMessageRow message={message} onRemove={() => onRemoveMessage(message.id)} />
							</motion.div>
						))}
					</AnimatePresence>
				</div>
			</motion.div>
		</div>
	)
}
