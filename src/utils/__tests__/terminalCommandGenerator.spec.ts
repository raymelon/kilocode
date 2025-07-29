import { describe, it, expect, vi, beforeEach } from "vitest"
import * as vscode from "vscode"
import { generateTerminalCommand } from "../terminalCommandGenerator"
import { ContextProxy } from "../../core/config/ContextProxy"
import { singleCompletionHandler } from "../single-completion-handler"

vi.mock("vscode")
vi.mock("../../core/config/ContextProxy")
vi.mock("../single-completion-handler")
vi.mock("../../shared/support-prompt", () => ({
	supportPrompt: {
		create: vi.fn().mockReturnValue("mocked prompt"),
	},
}))
vi.mock("../../core/config/ProviderSettingsManager", () => ({
	ProviderSettingsManager: vi.fn().mockImplementation(() => ({
		initialize: vi.fn().mockResolvedValue(undefined),
		getProfile: vi.fn().mockResolvedValue({
			name: "test",
			apiProvider: "anthropic",
			apiKey: "test-key",
		}),
	})),
}))

describe("generateTerminalCommand", () => {
	const mockOutputChannel = {
		appendLine: vi.fn(),
	} as unknown as vscode.OutputChannel

	const mockContext = {
		subscriptions: [],
		workspaceState: {
			get: vi.fn(),
		},
		globalState: {
			get: vi.fn(),
		},
	} as unknown as vscode.ExtensionContext

	const mockTerminal = {
		sendText: vi.fn(),
		show: vi.fn(),
		shellIntegration: {
			cwd: {
				fsPath: "/test/path",
			},
		},
	} as unknown as vscode.Terminal

	beforeEach(() => {
		vi.clearAllMocks()

		const mockContextProxy = {
			getProviderSettings: vi.fn().mockReturnValue({
				apiProvider: "anthropic",
				apiKey: "test-key",
			}),
			getValue: vi.fn().mockReturnValue(null),
		}
		Object.defineProperty(ContextProxy, "instance", {
			get: vi.fn(() => mockContextProxy),
			configurable: true,
		})

		vscode.window.showInputBox = vi.fn().mockResolvedValue("list files")
		Object.defineProperty(vscode.window, "activeTerminal", {
			get: vi.fn(() => mockTerminal),
			configurable: true,
		})
		vscode.window.withProgress = vi.fn().mockImplementation(async (options, callback) => {
			const mockProgress = { report: vi.fn() }
			return await callback(mockProgress as any, {} as any)
		})
		vscode.window.showInformationMessage = vi.fn().mockResolvedValue(undefined)
		vscode.window.showErrorMessage = vi.fn().mockResolvedValue(undefined)

		// Mock ProgressLocation enum
		Object.defineProperty(vscode, "ProgressLocation", {
			value: {
				Notification: 15,
				Window: 10,
				SourceControl: 1,
			},
			configurable: true,
		})

		vi.mocked(singleCompletionHandler).mockResolvedValue("ls -la")
	})

	it("should generate and execute terminal command successfully", async () => {
		await generateTerminalCommand({
			outputChannel: mockOutputChannel,
			context: mockContext,
		})

		expect(vscode.window.showInputBox).toHaveBeenCalledWith({
			prompt: "Describe the command you want to generate",
			placeHolder: "e.g., list all files in current directory, find large files, install npm package",
			ignoreFocusOut: true,
		})

		expect(singleCompletionHandler).toHaveBeenCalled()
		expect(mockTerminal.sendText).toHaveBeenCalledWith("ls -la")
		expect(mockTerminal.show).toHaveBeenCalled()
		expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Generated command: ls -la")
	})

	it("should handle user cancellation", async () => {
		vscode.window.showInputBox = vi.fn().mockResolvedValue(undefined)

		await generateTerminalCommand({
			outputChannel: mockOutputChannel,
			context: mockContext,
		})

		expect(singleCompletionHandler).not.toHaveBeenCalled()
		expect(mockTerminal.sendText).not.toHaveBeenCalled()
	})

	it("should handle missing active terminal", async () => {
		Object.defineProperty(vscode.window, "activeTerminal", {
			get: vi.fn(() => undefined),
			configurable: true,
		})

		await generateTerminalCommand({
			outputChannel: mockOutputChannel,
			context: mockContext,
		})

		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			"No active terminal found. Please open a terminal first.",
		)
		expect(singleCompletionHandler).not.toHaveBeenCalled()
	})

	it("should handle API configuration errors", async () => {
		const mockContextProxy = {
			getProviderSettings: vi.fn().mockReturnValue(null),
			getValue: vi.fn().mockReturnValue([]),
		}
		Object.defineProperty(ContextProxy, "instance", {
			get: vi.fn(() => mockContextProxy),
			configurable: true,
		})

		await generateTerminalCommand({
			outputChannel: mockOutputChannel,
			context: mockContext,
		})

		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			expect.stringContaining("Failed to generate command:"),
		)
	})
})
