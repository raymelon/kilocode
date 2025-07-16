import { describe, it, expect, beforeEach, vi } from "vitest"
import { MockWorkspace } from "./MockWorkspace"
import * as vscode from "vscode"
import { GhostStrategy } from "../GhostStrategy"
import { GhostWorkspaceEdit } from "../GhostWorkspaceEdit"
import { GhostSuggestionContext } from "../types"

vi.mock("vscode", () => ({
	Uri: {
		parse: (uriString: string) => ({
			toString: () => uriString,
			fsPath: uriString.replace("file://", ""),
			scheme: "file",
			path: uriString.replace("file://", ""),
		}),
	},
	Position: class {
		constructor(
			public line: number,
			public character: number,
		) {}
	},
	Range: class {
		constructor(
			public start: any,
			public end: any,
		) {}
	},
	WorkspaceEdit: class {
		private _edits = new Map()

		insert(uri: any, position: any, newText: string) {
			const key = uri.toString()
			if (!this._edits.has(key)) {
				this._edits.set(key, [])
			}
			this._edits.get(key).push({ range: { start: position, end: position }, newText })
		}

		delete(uri: any, range: any) {
			const key = uri.toString()
			if (!this._edits.has(key)) {
				this._edits.set(key, [])
			}
			this._edits.get(key).push({ range, newText: "" })
		}

		entries() {
			return Array.from(this._edits.entries()).map(([uriString, edits]) => [{ toString: () => uriString }, edits])
		}
	},
	workspace: {
		openTextDocument: vi.fn(),
		applyEdit: vi.fn(),
		asRelativePath: vi.fn().mockImplementation((uri) => {
			if (typeof uri === "string") {
				return uri.replace("file:///", "")
			}
			return uri.toString().replace("file:///", "")
		}),
	},
	window: {
		activeTextEditor: null,
	},
}))

describe("GhostProvider", () => {
	let mockWorkspace: MockWorkspace
	let strategy: GhostStrategy
	let workspaceEdit: GhostWorkspaceEdit

	beforeEach(() => {
		vi.clearAllMocks()
		strategy = new GhostStrategy()
		mockWorkspace = new MockWorkspace()
		workspaceEdit = new GhostWorkspaceEdit()

		vi.mocked(vscode.workspace.openTextDocument).mockImplementation(async (uri: any) => {
			const uriObj = typeof uri === "string" ? vscode.Uri.parse(uri) : uri
			return await mockWorkspace.openTextDocument(uriObj)
		})
		vi.mocked(vscode.workspace.applyEdit).mockImplementation(async (edit) => {
			await mockWorkspace.applyEdit(edit)
			return true
		})
	})

	// Helper function to normalize whitespace for consistent testing
	function normalizeWhitespace(content: string): string {
		return content.replace(/\t/g, "  ") // Convert tabs to 2 spaces
	}

	// Helper function to set up test document and context
	async function setupTestDocument(filename: string, content: string) {
		const testUri = vscode.Uri.parse(`file:///${filename}`)
		const normalizedContent = normalizeWhitespace(content)
		mockWorkspace.addDocument(testUri, normalizedContent)
		;(vscode.window as any).activeTextEditor = { document: { uri: testUri } }

		const mockDocument = await mockWorkspace.openTextDocument(testUri)
		;(mockDocument as any).uri = testUri

		const context: GhostSuggestionContext = {
			document: mockDocument,
			openFiles: [mockDocument],
		}

		return { testUri, context, mockDocument }
	}

	// Helper function to parse and apply suggestions with whitespace normalization
	async function parseAndApplySuggestions(diffResponse: string, context: GhostSuggestionContext) {
		const normalizedDiffResponse = normalizeWhitespace(diffResponse)
		const suggestions = await strategy.parseResponse(normalizedDiffResponse, context)
		await workspaceEdit.applySuggestions(suggestions)
	}

	describe("Simple Addition Suggestions", () => {
		it("should parse and apply a simple line addition", async () => {
			const initialContent = `\
function hello() {
  console.log('Hello');
}`
			const expected = `\
function hello() {
  // Added helpful comment
  console.log('Hello');
}`
			const diffResponse = `\
--- a/test.js
+++ b/test.js
@@ -1,3 +1,4 @@
 function hello() {
+  // Added helpful comment
   console.log('Hello');
 }`
			const { testUri, context } = await setupTestDocument("test.js", initialContent)
			await parseAndApplySuggestions(diffResponse, context)
			const finalContent = mockWorkspace.getDocumentContent(testUri)
			expect(finalContent).toBe(normalizeWhitespace(expected))
		})

		it("should parse and apply multiple line additions", async () => {
			const initialContent = `\
function calculate(a, b) {
  return a + b;
}`
			const diffResponse = `\
--- a/calculator.js
+++ b/calculator.js
@@ -1,3 +1,7 @@
 function calculate(a, b) {
+  // Validate inputs
+  if (typeof a !== 'number' || typeof b !== 'number') {
+    throw new Error('Invalid input');
+  }
   return a + b;
 }`
			const expected = `\
function calculate(a, b) {
  // Validate inputs
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Invalid input');
  }
  return a + b;
}`
			const { testUri, context } = await setupTestDocument("calculator.js", initialContent)
			await parseAndApplySuggestions(diffResponse, context)
			const finalContent = mockWorkspace.getDocumentContent(testUri)
			// The diff should add validation lines after the function declaration
			const expectedContent = normalizeWhitespace(expected)
			expect(finalContent).toBe(expectedContent)
		})
	})

	describe("Line Deletion Suggestions", () => {
		it("should parse and apply line deletions", async () => {
			const initialContent = `\
function process() {
  console.log('Starting');
  // TODO: Remove this debug line
  console.log('Debug info');
  console.log('Processing');
  console.log('Done');
}`
			const diffResponse = `\
--- a/cleanup.js
+++ b/cleanup.js
@@ -1,7 +1,5 @@
 function process() {
   console.log('Starting');
-  // TODO: Remove this debug line
-  console.log('Debug info');
   console.log('Processing');
   console.log('Done');
 }`

			const expected = `\
function process() {
	console.log('Starting');
	console.log('Processing');
  console.log('Done');
}`

			const { testUri, context } = await setupTestDocument("cleanup.js", initialContent)
			await parseAndApplySuggestions(diffResponse, context)

			const finalContent = mockWorkspace.getDocumentContent(testUri)
			// The diff should remove the TODO comment and debug log lines
			expect(finalContent).toBe(normalizeWhitespace(expected))
		})
	})

	describe("Mixed Addition and Deletion Suggestions", () => {
		it("should parse and apply mixed operations", async () => {
			const initialContent = `\
function oldFunction() {
  var x = 1;
  var y = 2;
  return x + y;
}`
			const diffResponse = `\
--- a/refactor.js
+++ b/refactor.js
@@ -1,5 +1,6 @@
-function oldFunction() {
-  var x = 1;
-  var y = 2;
+function newFunction() {
+  // Use const instead of var
+  const x = 1;
+  const y = 2;
   return x + y;
 }`
			const expected = `\
function newFunction() {
  // Use const instead of var
  const x = 1;
  const y = 2;
  return x + y;
}`

			const { testUri, context } = await setupTestDocument("refactor.js", initialContent)
			await parseAndApplySuggestions(diffResponse, context)
			const finalContent = mockWorkspace.getDocumentContent(testUri)
			// The diff should replace old function with new function using const
			expect(finalContent).toBe(normalizeWhitespace(expected))
		})
	})

	describe("Complex Multi-Group Suggestions", () => {
		it("should handle suggestions with multiple separate groups", async () => {
			const initialContent = `\
function first() {
  console.log('first');
}

function second() {
  console.log('second');
}

function third() {
  console.log('third');
}`

			const diffResponse = `\
--- a/multi.js
+++ b/multi.js
@@ -1,9 +1,11 @@
 function first() {
+  // Comment for first
   console.log('first');
 }
 
 function second() {
   console.log('second');
+  // Comment for second
 }
 
 function third() {`

			const expected = `\
function first() {
  // Comment for first
  console.log('first');
}

function second() {
  console.log('second');
  // Comment for second
}

function third() {
  console.log('third');
}`
			const { testUri, context } = await setupTestDocument("multi.js", initialContent)
			await parseAndApplySuggestions(diffResponse, context)
			const finalContent = mockWorkspace.getDocumentContent(testUri)
			// The diff should add comments after function declarations
			expect(finalContent).toBe(normalizeWhitespace(expected))
		})

		it("should handle sequential individual application of mixed operations", async () => {
			const initialContent = normalizeWhitespace(`\
function calculate() {
  let a = 1
  let b = 2

  let sum = a + b
  let product = a * b

  console.log(sum)
  console.log(product)

  return sum
}`)
			const diffResponse = `\
--- a/sequential.js
+++ b/sequential.js
@@ -1,12 +1,15 @@
 function calculate() {
   let a = 1
   let b = 2
+  let c = 3; // kilocode_change start: Add a new variable
 
   let sum = a + b
   let product = a * b
+  let difference = a - b; // kilocode_change end: Add a new variable
 
   console.log(sum)
   console.log(product)
+  console.log(difference); // kilocode_change start: Log the new variable
 
-  return sum
+  return sum + difference; // kilocode_change end: Return sum and difference
 }`

			const expected = `\
function calculate() {
  let a = 1
  let b = 2
  let c = 3; // kilocode_change start: Add a new variable

  let sum = a + b
  let product = a * b
  let difference = a - b; // kilocode_change end: Add a new variable

  console.log(sum)
  console.log(product)
  console.log(difference); // kilocode_change start: Log the new variable

  return sum + difference; // kilocode_change end: Return sum and difference
}`
			const { testUri, context } = await setupTestDocument("sequential.js", initialContent)
			const normalizedDiffResponse = normalizeWhitespace(diffResponse)
			const suggestions = await strategy.parseResponse(normalizedDiffResponse, context)

			const suggestionsFile = suggestions.getFile(testUri)
			suggestionsFile!.sortGroups()

			// Loop through each suggestion group and apply them one by one
			const groups = suggestionsFile!.getGroupsOperations()
			const groupsLength = groups.length
			for (let i = 0; i < groupsLength; i++) {
				// Apply the currently selected suggestion group
				await workspaceEdit.applySelectedSuggestions(suggestions)
				suggestionsFile!.deleteSelectedGroup()
			}

			// Verify the final document content is correct
			const finalContent = mockWorkspace.getDocumentContent(testUri)
			const expectedContent = normalizeWhitespace(expected)
			expect(finalContent).toBe(expectedContent)
		})
	})

	describe("Error Handling", () => {
		it("should handle empty diff responses", async () => {
			const initialContent = `console.log('test');`
			const { context } = await setupTestDocument("empty.js", initialContent)

			// Test empty response
			const suggestions = await strategy.parseResponse("", context)
			expect(suggestions.hasSuggestions()).toBe(false)
		})

		it("should handle invalid diff format", async () => {
			const initialContent = `console.log('test');`
			const { context } = await setupTestDocument("invalid.js", initialContent)

			// Test invalid diff format
			const invalidDiff = "This is not a valid diff format"
			const suggestions = await strategy.parseResponse(invalidDiff, context)
			expect(suggestions.hasSuggestions()).toBe(false)
		})

		it("should handle file not found in context", async () => {
			const initialContent = `console.log('test');`
			await setupTestDocument("missing.js", initialContent)

			// Create context without the file in openFiles
			const context: GhostSuggestionContext = {
				openFiles: [], // Empty - file not in context
			}

			const diffResponse =
				"--- a/missing.js\n+++ b/missing.js\n@@ -1,1 +1,2 @@\n+// Added comment\n console.log('test');"

			const suggestions = await strategy.parseResponse(diffResponse, context)
			// Should still work even if file not in openFiles - it can still parse the diff
			expect(suggestions.hasSuggestions()).toBe(true)
		})
	})
})
