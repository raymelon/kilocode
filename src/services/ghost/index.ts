import * as vscode from "vscode"
import { GhostProvider } from "./GhostProvider"
import { GhostCodeActionProvider } from "./GhostCodeActionProvider"
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
		vscode.commands.registerCommand("kilocode.ghost.provideCodeSuggestions", async () => {
			vscode.window.showInformationMessage(t("kilocode:ghost.commands.generateSuggestions"))
			//ghost.provideCodeSuggestions(document, range)
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghostWriter.cancelSuggestions", async () => {
			ghost.cancelSuggestions()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghostWriter.applyAllSuggestions", async () => {
			ghost.applyAllSuggestions()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghostWriter.applyCurrentSuggestions", async () => {
			ghost.applySelectedSuggestions()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghostWriter.promptCodeSuggestion", async () => {
			await ghost.promptCodeSuggestion()
		}),
	)

	// Register GhostProvider Key Bindings
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghostWriter.keyTab", async () => {
			await ghost.applySelectedSuggestions()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghostWriter.keyEscape", async () => {
			await ghost.cancelSuggestions()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghostWriter.keyUp", async () => {
			await ghost.selectPreviousSuggestion()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghostWriter.keyDown", async () => {
			await ghost.selectNextSuggestion()
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand("kilo-code.ghostWriter.keyCmdI", async () => {
			await ghost.promptCodeSuggestion()
		}),
	)

	// Register GhostProvider Code Actions
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider("*", new GhostCodeActionProvider(), {
			providedCodeActionKinds: Object.values(GhostCodeActionProvider.providedCodeActionKinds),
		}),
	)
}
