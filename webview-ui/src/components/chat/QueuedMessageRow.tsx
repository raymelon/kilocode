// kilocode_change - new file
import React from "react"
import { motion } from "framer-motion"
import { Trash2 } from "lucide-react"
import type { QueuedMessage } from "./hooks/useQueuedMessages"
import { cn } from "@/lib/utils"

interface QueuedMessageRowProps {
	message: QueuedMessage
	onRemove: () => void
}

export function QueuedMessageRow({ message, onRemove }: QueuedMessageRowProps) {
	const hasImages = message.images.length > 0
	const displayText = message.text || (hasImages ? `${message.images.length} image(s)` : "Empty message")

	const handleRemove = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		onRemove()
	}

	return (
		<motion.div className="flex items-center px-2 gap-2 bg-vscode-editor-background rounded">
			<div className="flex-1 min-w-0 text-[12px] flex items-center gap-2">
				<div className="text-vscode-foreground truncate" title={message.text}>
					{displayText}
				</div>
				{hasImages && message.text && (
					<div className="text-vscode-descriptionForeground">
						+ {message.images.length} image{message.images.length !== 1 ? "s" : ""}
					</div>
				)}
			</div>
			<motion.div transition={{ duration: 0.1 }} className="flex-shrink-0">
				<button
					onClick={handleRemove}
					title="Remove queued message"
					className={cn(
						"cursor-pointer relative inline-flex items-center justify-center",
						"bg-transparent border-none p-1.5",
						"rounded-md min-w-[28px] min-h-[28px]",
						"opacity-60 hover:opacity-100 text-vscode-descriptionForeground hover:text-vscode-foreground",
						"transition-all duration-150",
						"hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)]",
						"focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder",
						"active:bg-[rgba(255,255,255,0.1)]",
					)}>
					<Trash2 size={14} />
				</button>
			</motion.div>
		</motion.div>
	)
}
