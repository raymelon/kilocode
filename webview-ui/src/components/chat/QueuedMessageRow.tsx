// kilocode_change - new file
import React from "react"
import { motion } from "framer-motion"
import { Trash2 } from "lucide-react"
import type { QueuedMessage } from "./hooks/useQueuedMessages"
import { IconButton } from "../ui/IconButton"

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
		<motion.div className="flex items-center px-2 gap-2 bg-vscode-editor-background">
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
				<IconButton onClick={handleRemove} title="Remove queued message" variant="default" size="md">
					<Trash2 size={14} />
				</IconButton>
			</motion.div>
		</motion.div>
	)
}
