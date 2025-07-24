import React from "react"
import { cn } from "@/lib/utils"

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "default" | "subtle"
	size?: "sm" | "md"
	children: React.ReactNode
}

export function IconButton({ variant = "default", size = "md", className, children, ...props }: IconButtonProps) {
	return (
		<button
			className={cn(
				"cursor-pointer relative inline-flex items-center justify-center",
				"bg-transparent border-none",
				"rounded-md transition-all duration-150",
				"focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder",
				// Size variants
				size === "sm" && "p-1 min-w-[20px] min-h-[20px]",
				size === "md" && "p-1.5 min-w-[28px] min-h-[28px]",
				// Style variants
				variant === "default" && [
					"opacity-60 hover:opacity-100",
					"text-vscode-descriptionForeground hover:text-vscode-foreground",
					"hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)]",
					"active:bg-[rgba(255,255,255,0.1)]",
				],
				variant === "subtle" && ["hover:bg-vscode-button-hoverBackground"],
				className,
			)}
			{...props}>
			{children}
		</button>
	)
}
