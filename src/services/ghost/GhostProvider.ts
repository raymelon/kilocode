import * as vscode from "vscode"
import { GhostDocumentStore } from "./GhostDocumentStore"
import { GhostStrategy } from "./GhostStrategy"
import { GhostModel } from "./GhostModel"
import { GhostWorkspaceEdit } from "./GhostWorkspaceEdit"
import { GhostDecorations } from "./GhostDecorations"
import { GhostSuggestionContext } from "./types"
import { t } from "../../i18n"
import { addCustomInstructions } from "../../core/prompts/sections/custom-instructions"
import { getWorkspacePath } from "../../utils/path"
import { GhostSuggestionsState } from "./GhostSuggestions"

export class GhostProvider {
	private static instance: GhostProvider | null = null
	private decorations: GhostDecorations
	private documentStore: GhostDocumentStore
	private model: GhostModel
	private strategy: GhostStrategy
	private workspaceEdit: GhostWorkspaceEdit
	private suggestions: GhostSuggestionsState = new GhostSuggestionsState()
	private context: vscode.ExtensionContext

	private constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.decorations = new GhostDecorations()
		this.documentStore = new GhostDocumentStore()
		this.model = new GhostModel()
		this.strategy = new GhostStrategy()
		this.workspaceEdit = new GhostWorkspaceEdit()
	}

	public static getInstance(context?: vscode.ExtensionContext): GhostProvider {
		if (!GhostProvider.instance) {
			if (!context) {
				throw new Error("ExtensionContext is required for first initialization of GhostProvider")
			}
			GhostProvider.instance = new GhostProvider(context)
		}
		return GhostProvider.instance
	}

	public getDocumentStore() {
		return this.documentStore
	}

	public async promptCodeSuggestion() {
		const userInput = await vscode.window.showInputBox({
			prompt: t("kilocode:ghost.input.title"),
			placeHolder: t("kilocode:ghost.input.placeholder"),
		})

		if (!userInput) {
			return
		}

		const editor = vscode.window.activeTextEditor
		if (!editor) {
			return
		}
		const document = editor.document
		const range = editor.selection.isEmpty ? undefined : editor.selection

		await this.provideCodeSuggestions({
			document,
			range,
			userInput,
		})
	}

	public async provideCodeActionQuickFix(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
	): Promise<void> {
		// Store the document in the document store
		this.getDocumentStore().storeDocument(document)
		await this.provideCodeSuggestions({
			document,
			range,
		})
	}

	private async provideCodeSuggestions(context: GhostSuggestionContext): Promise<void> {
		let cancelled = false

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: t("kilocode:ghost.progress.title"),
				cancellable: true,
			},
			async (progress, progressToken) => {
				progressToken.onCancellationRequested(() => {
					cancelled = true
				})

				progress.report({
					message: t("kilocode:ghost.progress.analyzing"),
				})

				// Load custom instructions
				const workspacePath = getWorkspacePath()
				const customInstructions = await addCustomInstructions("", "", workspacePath, "ghost")

				const systemPrompt = this.strategy.getSystemPrompt(customInstructions)
				const userPrompt = this.strategy.getSuggestionPrompt(context)

				if (cancelled) {
					return
				}
				progress.report({
					message: t("kilocode:ghost.progress.generating"),
				})

				const response = await this.model.generateResponse(systemPrompt, userPrompt)

				console.log("Ghost response:", response)

				if (cancelled) {
					return
				}

				progress.report({
					message: t("kilocode:ghost.progress.processing"),
				})
				// First parse the response into edit operations
				this.suggestions = await this.strategy.parseResponse(response)

				if (cancelled) {
					this.suggestions.clear()
					await this.updateGlobalContext()
					return
				}
				await this.updateGlobalContext()

				progress.report({
					message: t("kilocode:ghost.progress.showing"),
				})
				// Generate placeholder for show the suggestions
				await this.workspaceEdit.applySuggestionsPlaceholders(this.suggestions)
				// Display the suggestions in the active editor
				await this.displaySuggestions()
			},
		)
	}

	public async displaySuggestions() {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			console.log("No active editor found, returning")
			return
		}
		this.decorations.displaySuggestions(this.suggestions)
	}

	private async updateGlobalContext() {
		const haveSuggestions = this.suggestions.haveSuggestions()
		await vscode.commands.executeCommand("setContext", "kilocode.ghost.haveSuggestions", haveSuggestions)
	}

	public havePendingSuggestions(): boolean {
		return this.suggestions.haveSuggestions()
	}

	public async cancelSuggestions() {
		if (!this.havePendingSuggestions()) {
			return
		}
		// Clear the decorations in the active editor
		this.decorations.clearAll()

		await this.workspaceEdit.revertSuggestionsPlaceholder(this.suggestions)

		// Clear the pending suggestions
		this.suggestions.clear()

		// Update the global context
		await this.updateGlobalContext()
	}

	public async applySelectedSuggestions() {
		if (!this.havePendingSuggestions()) {
			return
		}
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			console.log("No active editor found, returning")
			return
		}
		const suggestionsFile = this.suggestions.getFile(editor.document.uri)
		if (!suggestionsFile) {
			console.log(`No suggestions found for document: ${editor.document.uri.toString()}`)
			return
		}
		if (suggestionsFile.getSelectedGroup() === -1) {
			console.log("No group selected, returning")
			return
		}
		this.decorations.clearAll()
		await this.workspaceEdit.revertSelectedSuggestionsPlaceholder(this.suggestions)
		await this.workspaceEdit.applySelectedSuggestions(this.suggestions)
		suggestionsFile.deleteSelectedGroup()
		this.suggestions.validateFiles()
		await this.updateGlobalContext()
		if (this.havePendingSuggestions()) {
			this.decorations.displaySuggestions(this.suggestions)
		}
	}

	public async applyAllSuggestions() {
		if (!this.havePendingSuggestions()) {
			return
		}
		this.decorations.clearAll()
		await this.workspaceEdit.revertSuggestionsPlaceholder(this.suggestions)
		await this.workspaceEdit.applySuggestions(this.suggestions)
		this.suggestions.clear()
		await this.updateGlobalContext()
	}

	public async selectNextSuggestion() {
		if (!this.havePendingSuggestions()) {
			return
		}
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			console.log("No active editor found, returning")
			return
		}
		const suggestionsFile = this.suggestions.getFile(editor.document.uri)
		if (!suggestionsFile) {
			console.log(`No suggestions found for document: ${editor.document.uri.toString()}`)
			return
		}
		suggestionsFile.selectNextGroup()
		this.decorations.displaySuggestions(this.suggestions)
	}

	public async selectPreviousSuggestion() {
		if (!this.havePendingSuggestions()) {
			return
		}
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			console.log("No active editor found, returning")
			return
		}
		const suggestionsFile = this.suggestions.getFile(editor.document.uri)
		if (!suggestionsFile) {
			console.log(`No suggestions found for document: ${editor.document.uri.toString()}`)
			return
		}
		suggestionsFile.selectPreviousGroup()
		this.decorations.displaySuggestions(this.suggestions)
	}
}
