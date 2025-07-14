import * as vscode from "vscode"
import { GhostProvider } from "./GhostProvider"
import { t } from "../../i18n"

export const registerGhostProvider = (context: vscode.ExtensionContext) => {
	const ghost = GhostProvider.getInstance(context)

	// Register GhostProvider Commands
	context.subscriptions.push(
		vscode.commands.registerCommand("kilocode.ghost.codeActionQuickFix", async () => {
			return
		}),
	)

	// Register GhostProvider Commands
	context.subscriptions.push(
		vscode.commands.registerCommand("kilocode.ghost.generateSuggestions", async () => {
			ghost.codeSuggestion()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghost.cancelSuggestions", async () => {
			ghost.cancelSuggestions()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghost.applyAllSuggestions", async () => {
			ghost.applyAllSuggestions()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghost.applyCurrentSuggestions", async () => {
			ghost.applySelectedSuggestions()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghost.promptCodeSuggestion", async () => {
			await ghost.promptCodeSuggestion()
		}),
	)

	// Register GhostProvider Key Bindings
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghost.keyTab", async () => {
			await ghost.applySelectedSuggestions()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghost.keyEscape", async () => {
			await ghost.cancelSuggestions()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghost.keyUp", async () => {
			await ghost.selectPreviousSuggestion()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghost.keyDown", async () => {
			await ghost.selectNextSuggestion()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghost.keyCmdI", async () => {
			await ghost.promptCodeSuggestion()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghost.keyCmdL", async () => {
			await ghost.codeSuggestion()
		}),
	)

	// Register GhostProvider Code Actions
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider("*", ghost.codeActionProvider, {
			providedCodeActionKinds: Object.values(ghost.codeActionProvider.providedCodeActionKinds),
		}),
	)

	// Register GhostProvider Code Lens
	context.subscriptions.push(vscode.languages.registerCodeLensProvider("*", ghost.codeLensProvider))
}
