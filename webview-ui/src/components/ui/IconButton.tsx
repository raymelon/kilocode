import { cn } from "@/lib/utils"
import { StandardTooltip } from "@/components/ui"

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	iconClass?: string
	title?: string
	disabled?: boolean
	isLoading?: boolean
	style?: React.CSSProperties
	size?: "sm" | "md"
	children?: React.ReactNode
}

export const IconButton: React.FC<IconButtonProps> = ({
	iconClass,
	title,
	className,
	disabled,
	isLoading,
	onClick,
	style,
	size = "md",
	children,
	...props
}) => {
	const buttonClasses = cn(
		"relative inline-flex items-center justify-center",
		"bg-transparent border-none",
		"rounded-md transition-all duration-150",
		"text-vscode-foreground opacity-85",
		"hover:opacity-100 hover:bg-vscode-list-hoverBackground",
		"focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder",
		"active:bg-[rgba(255,255,255,0.1)]",
		// Size variants
		size === "sm" && "p-1 min-w-[20px] min-h-[20px]",
		size === "md" && "p-1.5 min-w-[28px] min-h-[28px]",
		!disabled && "cursor-pointer",
		disabled &&
			"opacity-40 cursor-not-allowed grayscale-[30%] hover:bg-transparent hover:border-[rgba(255,255,255,0.08)] active:bg-transparent",
		className,
	)

	const iconClasses = cn("codicon", iconClass, isLoading && "codicon-modifier-spin")

	const buttonContent = children ? children : iconClass ? <span className={iconClasses} /> : null

	const button = (
		<button
			aria-label={title}
			className={buttonClasses}
			disabled={disabled}
			onClick={!disabled ? onClick : undefined}
			style={{ fontSize: 16.5, ...style }}
			{...props}>
			{buttonContent}
		</button>
	)

	return title ? <StandardTooltip content={title}>{button}</StandardTooltip> : button
}
