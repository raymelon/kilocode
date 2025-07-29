import * as vscode from "vscode"
import { TerminalWelcomeService } from "./TerminalWelcomeService"

export const registerTerminalWelcome = (context: vscode.ExtensionContext) => {
	const terminalWelcomeService = new TerminalWelcomeService(context)
	terminalWelcomeService.initialize()
	context.subscriptions.push(terminalWelcomeService)
}
