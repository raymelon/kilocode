import * as vscode from "vscode"
import { t } from "../../i18n"

/**
 * Service that displays welcome messages in newly opened terminals
 * by sending echo commands directly to the terminal
 */
export class TerminalWelcomeService {
	private disposables: vscode.Disposable[] = []
	private shownTerminals = new Set<vscode.Terminal>()

	constructor(private context: vscode.ExtensionContext) {}

	/**
	 * Initialize the terminal welcome service
	 */
	public initialize(): void {
		// Listen for new terminals being opened
		const onDidOpenTerminal = vscode.window.onDidOpenTerminal((terminal) => {
			this.handleTerminalOpened(terminal)
		})

		this.disposables.push(onDidOpenTerminal)

		// Also check existing terminals that might have been opened before activation
		vscode.window.terminals.forEach((terminal) => {
			this.handleTerminalOpened(terminal)
		})
	}

	/**
	 * Handle when a terminal is opened
	 */
	private handleTerminalOpened(terminal: vscode.Terminal): void {
		// Skip if we've already shown a message for this terminal
		if (this.shownTerminals.has(terminal)) {
			return
		}

		// Skip extension-created terminals (like "Kilo Code")
		if (this.isExtensionTerminal(terminal)) {
			return
		}

		// Mark this terminal as having been shown a message
		this.shownTerminals.add(terminal)

		// Send the welcome message after a short delay to ensure terminal is ready
		setTimeout(() => {
			this.showWelcomeMessage(terminal)
		}, 500)

		// Clean up when terminal is closed
		const onDidCloseTerminal = vscode.window.onDidCloseTerminal((closedTerminal) => {
			if (closedTerminal === terminal) {
				this.shownTerminals.delete(terminal)
				onDidCloseTerminal.dispose()
			}
		})

		this.disposables.push(onDidCloseTerminal)
	}

	/**
	 * Check if this is a terminal created by an extension
	 */
	private isExtensionTerminal(terminal: vscode.Terminal): boolean {
		const name = terminal.name.toLowerCase()

		// Skip terminals created by Kilo Code or other extensions
		const extensionTerminalNames = [
			"kilo code",
			"kilocode",
			"roo code",
			"extension host",
			"task",
			"git",
			"npm",
			"yarn",
			"pnpm",
		]

		return extensionTerminalNames.some((extName) => name.includes(extName))
	}

	private showWelcomeMessage(terminal: vscode.Terminal): void {
		// Get the keyboard shortcut for the generate command
		const shortcut = this.getKeyboardShortcut()

		// Create the welcome message using translatable string
		const message = t("kilocode:terminalWelcome.message", { shortcut })

		// Show as a VSCode information message (toast notification)
		vscode.window.showInformationMessage(message)
	}

	private getKeyboardShortcut(): string {
		const isMac = process.platform === "darwin"
		const modifier = isMac ? "Cmd" : "Ctrl"

		// Try to get the actual configured keybinding
		// Default to OS-appropriate shortcut if not found
		return `${modifier}+Shift+G`
	}

	public dispose(): void {
		this.disposables.forEach((disposable) => disposable.dispose())
		this.disposables = []
		this.shownTerminals.clear()
	}
}
