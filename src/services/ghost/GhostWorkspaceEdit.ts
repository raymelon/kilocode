import * as vscode from "vscode"
import { GhostSuggestionEditOperation, GhostSuggestionEditOperationsOffset } from "./types"
import { GhostSuggestionsState } from "./GhostSuggestions"

export class GhostWorkspaceEdit {
	private locked: boolean = false

	private async applyOperations(
		documentUri: vscode.Uri,
		operations: GhostSuggestionEditOperation[],
		previousOperations: GhostSuggestionEditOperationsOffset | undefined = { added: 0, removed: 0, offset: 0 },
	) {
		const workspaceEdit = new vscode.WorkspaceEdit()
		if (operations.length === 0) {
			return // No operations to apply
		}

		const document = await vscode.workspace.openTextDocument(documentUri)
		if (!document) {
			console.log(`Could not open document: ${documentUri.toString()}`)
			return
		}
		const sortedOps = operations.sort((a, b) => a.line - b.line)
		const deleteOps = sortedOps.filter((op) => op.type === "-")
		const insertOps = sortedOps.filter((op) => op.type === "+")

		const anchorLine = sortedOps[0].line

		if (deleteOps.length > 0) {
			const firstDeleteLine = deleteOps[0].line
			const lastDeleteLine = deleteOps[deleteOps.length - 1].line
			const startPosition = new vscode.Position(firstDeleteLine, 0)
			let endPosition
			if (lastDeleteLine >= document.lineCount - 1) {
				endPosition = document.lineAt(lastDeleteLine).rangeIncludingLineBreak.end
			} else {
				endPosition = new vscode.Position(lastDeleteLine + 1, 0)
			}
			const deleteRange = new vscode.Range(startPosition, endPosition)
			workspaceEdit.delete(documentUri, deleteRange)
		}

		if (insertOps.length > 0) {
			const insertionBlocks: GhostSuggestionEditOperation[][] = []
			for (const op of insertOps) {
				const lastBlock = insertionBlocks[insertionBlocks.length - 1]
				if (lastBlock && op.line === lastBlock[lastBlock.length - 1].line + 1) {
					lastBlock.push(op)
				} else {
					insertionBlocks.push([op])
				}
			}
			for (const block of insertionBlocks) {
				const anchorLine = block[0].line
				const textToInsert = block.map((op) => op.content || "").join("\n") + "\n"

				const insertPosition = new vscode.Position(anchorLine, 0)
				workspaceEdit.insert(documentUri, insertPosition, textToInsert)
			}
		}

		await vscode.workspace.applyEdit(workspaceEdit)
	}

	private async revertOperationsPlaceholder(documentUri: vscode.Uri, operations: GhostSuggestionEditOperation[]) {
		let workspaceEdit = new vscode.WorkspaceEdit()
		let deletedLines: number = 0
		for (const op of operations) {
			if (op.type === "-") {
				deletedLines++
			}
			if (op.type === "+") {
				const startPosition = new vscode.Position(op.line + deletedLines, 0)
				const endPosition = new vscode.Position(op.line + deletedLines + 1, 0)
				const range = new vscode.Range(startPosition, endPosition)
				workspaceEdit.delete(documentUri, range)
			}
		}
		await vscode.workspace.applyEdit(workspaceEdit)
	}

	private async applyOperationsPlaceholders(documentUri: vscode.Uri, operations: GhostSuggestionEditOperation[]) {
		const workspaceEdit = new vscode.WorkspaceEdit()
		const document = await vscode.workspace.openTextDocument(documentUri)
		if (!document) {
			console.log(`Could not open document: ${documentUri.toString()}`)
			return
		}

		let lineOffset = 0
		for (const op of operations) {
			// Calculate the equivalent line in the *original* document.
			const originalLine = op.line - lineOffset

			// A quick guard against invalid operations.
			if (originalLine < 0) {
				continue
			}

			if (op.type === "+") {
				const position = new vscode.Position(originalLine, 0)
				const textToInsert = "\n"
				workspaceEdit.insert(documentUri, position, textToInsert)
				lineOffset++
			}

			if (op.type === "-") {
				// Guard against deleting a line that doesn't exist.
				if (originalLine >= document.lineCount) {
					continue
				}
				lineOffset--
			}
		}

		await vscode.workspace.applyEdit(workspaceEdit)
	}

	private getActiveFileOperations(suggestions: GhostSuggestionsState) {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			return {
				documentUri: null,
				operations: [],
			}
		}
		const documentUri = editor.document.uri
		const operations = suggestions.getFile(documentUri)?.getAllOperations() || []
		return {
			documentUri,
			operations,
		}
	}

	private async getActiveFileSelectedOperations(suggestions: GhostSuggestionsState) {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			return {
				documentUri: null,
				operations: [],
			}
		}
		const documentUri = editor.document.uri
		const suggestionsFile = suggestions.getFile(documentUri)
		if (!suggestionsFile) {
			return {
				documentUri: null,
				operations: [],
			}
		}
		const operations = suggestionsFile.getSelectedGroupOperations()
		return {
			documentUri,
			operations,
		}
	}

	private async getActiveFileSelectedPreviousOperations(
		suggestions: GhostSuggestionsState,
	): Promise<GhostSuggestionEditOperationsOffset> {
		const defaultOffset: GhostSuggestionEditOperationsOffset = { added: 0, removed: 0, offset: 0 }
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			return defaultOffset
		}
		const documentUri = editor.document.uri
		const suggestionsFile = suggestions.getFile(documentUri)
		if (!suggestionsFile) {
			return defaultOffset
		}
		return suggestionsFile.getPlaceholderOffsetSelectedGroupOperations()
	}

	public isLocked(): boolean {
		return this.locked
	}

	public async applySuggestions(suggestions: GhostSuggestionsState) {
		if (this.locked) {
			return
		}
		this.locked = true
		const { documentUri, operations } = this.getActiveFileOperations(suggestions)
		if (!documentUri || operations.length === 0) {
			console.log("No active document or no operations to apply.")
			return
		}
		await this.applyOperations(documentUri, operations)
		this.locked = false
	}

	public async applySelectedSuggestions(suggestions: GhostSuggestionsState) {
		if (this.locked) {
			return
		}
		this.locked = true
		const { documentUri, operations } = await this.getActiveFileSelectedOperations(suggestions)
		if (!documentUri || operations.length === 0) {
			console.log("No active document or no selected operations to apply.")
			return
		}
		await this.applyOperations(documentUri, operations)
		this.locked = false
	}

	public async revertSuggestionsPlaceholder(suggestions: GhostSuggestionsState): Promise<void> {
		if (this.locked) {
			return
		}
		this.locked = true
		const { documentUri, operations } = this.getActiveFileOperations(suggestions)
		if (!documentUri || operations.length === 0) {
			console.log("No active document or no operations to apply.")
			return
		}
		await this.revertOperationsPlaceholder(documentUri, operations)
		this.locked = false
	}

	public async revertSelectedSuggestionsPlaceholder(suggestions: GhostSuggestionsState): Promise<void> {
		if (this.locked) {
			return
		}
		this.locked = true
		const { documentUri, operations } = await this.getActiveFileSelectedOperations(suggestions)
		if (!documentUri || operations.length === 0) {
			console.log("No active document or no selected operations to apply.")
			return
		}
		await this.revertOperationsPlaceholder(documentUri, operations)
		this.locked = false
	}

	public async applySuggestionsPlaceholders(suggestions: GhostSuggestionsState) {
		if (this.locked) {
			return
		}
		this.locked = true
		const { documentUri, operations } = await this.getActiveFileOperations(suggestions)
		if (!documentUri || operations.length === 0) {
			console.log("No active document or no operations to apply.")
			return
		}
		await this.applyOperationsPlaceholders(documentUri, operations)
		this.locked = false
	}
}
