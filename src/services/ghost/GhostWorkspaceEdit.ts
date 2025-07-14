import * as vscode from "vscode"
import { GhostSuggestionEditOperation } from "./types"
import { GhostSuggestionsState } from "./GhostSuggestions"

export class GhostWorkspaceEdit {
	private async applyOperations(documentUri: vscode.Uri, operations: GhostSuggestionEditOperation[]) {
		const workspaceEdit = new vscode.WorkspaceEdit()
		if (operations.length === 0) {
			return // No operations to apply
		}

		const document = await vscode.workspace.openTextDocument(documentUri)
		if (!document) {
			console.log(`Could not open document: ${documentUri.toString()}`)
			return
		}
		const deleteOps = operations.filter((op) => op.type === "-")
		const insertOps = operations.filter((op) => op.type === "+")

		let delPtr = 0
		let insPtr = 0
		let lineOffset = 0

		while (delPtr < deleteOps.length || insPtr < insertOps.length) {
			const nextDeleteOriginalLine = deleteOps[delPtr]?.line ?? Infinity
			const nextInsertOriginalLine = (insertOps[insPtr]?.line ?? Infinity) - lineOffset

			if (nextDeleteOriginalLine <= nextInsertOriginalLine) {
				// Process the deletion next
				const op = deleteOps[delPtr]
				const range = document.lineAt(op.line).rangeIncludingLineBreak
				workspaceEdit.delete(documentUri, range)

				lineOffset--
				delPtr++
			} else {
				// Process the insertion next
				const op = insertOps[insPtr]
				const position = new vscode.Position(nextInsertOriginalLine, 0)
				const textToInsert = (op.content || "") + "\n"
				workspaceEdit.insert(documentUri, position, textToInsert)

				lineOffset++
				insPtr++
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

	public async applySuggestions(suggestions: GhostSuggestionsState) {
		const { documentUri, operations } = this.getActiveFileOperations(suggestions)
		if (!documentUri || operations.length === 0) {
			console.log("No active document or no operations to apply.")
			return
		}
		await this.applyOperations(documentUri, operations)
	}

	public async applySelectedSuggestions(suggestions: GhostSuggestionsState) {
		const { documentUri, operations } = await this.getActiveFileSelectedOperations(suggestions)
		if (!documentUri || operations.length === 0) {
			console.log("No active document or no selected operations to apply.")
			return
		}
		await this.applyOperations(documentUri, operations)
	}

	public async revertSuggestionsPlaceholder(suggestions: GhostSuggestionsState): Promise<void> {
		const { documentUri, operations } = this.getActiveFileOperations(suggestions)
		if (!documentUri || operations.length === 0) {
			console.log("No active document or no operations to apply.")
			return
		}
		await this.revertOperationsPlaceholder(documentUri, operations)
	}

	public async revertSelectedSuggestionsPlaceholder(suggestions: GhostSuggestionsState): Promise<void> {
		const { documentUri, operations } = await this.getActiveFileSelectedOperations(suggestions)
		if (!documentUri || operations.length === 0) {
			console.log("No active document or no selected operations to apply.")
			return
		}
		await this.revertOperationsPlaceholder(documentUri, operations)
	}

	public async applySuggestionsPlaceholders(suggestions: GhostSuggestionsState) {
		const { documentUri, operations } = await this.getActiveFileOperations(suggestions)
		if (!documentUri || operations.length === 0) {
			console.log("No active document or no operations to apply.")
			return
		}
		await this.applyOperationsPlaceholders(documentUri, operations)
	}
}
