// kilocode_change - new file
import { motion, AnimatePresence } from "framer-motion"
import { useState } from "react"
import { ChevronRight, Pause, Play } from "lucide-react"
import type { QueuedMessage } from "./hooks/useQueuedMessages"
import { QueuedMessageRow } from "./QueuedMessageRow"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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

	if (messages.length === 0) {
		return <div className={cn("mx-2 pb-2", className)}></div>
	}

	const messageCount = messages.length
	const messageText = messageCount === 1 ? "message" : "messages"
	const queueStatus = isQueuePaused ? "paused" : "active"

	return (
		<div className={cn("mx-2 pb-2 border border-b-none rounded-md", className)}>
			<Collapsible open={isOpen} onOpenChange={setIsOpen}>
				<CollapsibleTrigger asChild>
					<motion.div
						className="flex items-center px-2 py-2 cursor-pointer hover:bg-vscode-list-hoverBackground rounded-t border-b border-vscode-widget-border"
						whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
						transition={{ duration: 0.15 }}>
						<motion.div
							animate={{ rotate: isOpen ? 90 : 0 }}
							transition={{ duration: 0.2, ease: "easeInOut" }}>
							<ChevronRight size={16} className="text-vscode-descriptionForeground" />
						</motion.div>
						<span className="text-[12px] ml-2 text-vscode-descriptionForeground font-medium select-none">
							{messageCount} {messageText} in queue
						</span>
						{isQueuePaused && (
							<div className="flex items-center ml-auto gap-1">
								<Pause size={12} className="text-vscode-charts-orange" />
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
					</motion.div>
				</CollapsibleTrigger>
				<CollapsibleContent>
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
				</CollapsibleContent>
			</Collapsible>
		</div>
	)
}
