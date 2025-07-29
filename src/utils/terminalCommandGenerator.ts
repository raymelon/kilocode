import * as vscode from "vscode"
import { ContextProxy } from "../core/config/ContextProxy"
import { ProviderSettingsManager } from "../core/config/ProviderSettingsManager"
import { supportPrompt } from "../shared/support-prompt"
import { singleCompletionHandler } from "./single-completion-handler"
import type { ProviderSettings } from "@roo-code/types"

export interface TerminalCommandGeneratorOptions {
	outputChannel: vscode.OutputChannel
	context: vscode.ExtensionContext
}

/**
 * Generates and executes terminal commands using AI based on user input
 */
export async function generateTerminalCommand(options: TerminalCommandGeneratorOptions): Promise<void> {
	const { outputChannel, context } = options

	try {
		const userInput = await promptForCommandDescription()
		if (!userInput) {
			return // User cancelled
		}

		const activeTerminal = vscode.window.activeTerminal
		if (!activeTerminal) {
			vscode.window.showErrorMessage("No active terminal found. Please open a terminal first.")
			return
		}

		await executeCommandGeneration(activeTerminal, userInput, outputChannel, context)
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
		outputChannel.appendLine(`Error in generateTerminalCommand: ${errorMessage}`)
		vscode.window.showErrorMessage(`Error: ${errorMessage}`)
	}
}

async function promptForCommandDescription(): Promise<string | undefined> {
	return await vscode.window.showInputBox({
		prompt: "Describe the command you want to generate",
		placeHolder: "e.g., list all files in current directory, find large files, install npm package",
		ignoreFocusOut: true,
	})
}

async function executeCommandGeneration(
	activeTerminal: vscode.Terminal,
	userInput: string,
	outputChannel: vscode.OutputChannel,
	context: vscode.ExtensionContext,
): Promise<void> {
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "Generating terminal command...",
			cancellable: false,
		},
		async () => {
			try {
				const terminalContext = buildTerminalContext(activeTerminal)
				const apiConfiguration = await getApiConfiguration(context)
				const customSupportPrompts = ContextProxy.instance?.getValue("customSupportPrompts") || {}

				const prompt = supportPrompt.create(
					"TERMINAL_GENERATE",
					{
						userInput,
						...terminalContext,
					},
					customSupportPrompts,
				)

				const generatedCommand = await singleCompletionHandler(apiConfiguration, prompt)
				const cleanCommand = cleanGeneratedCommand(generatedCommand)

				executeCommandInTerminal(activeTerminal, cleanCommand)
				showSuccessMessage(cleanCommand)
			} catch (error) {
				handleGenerationError(error, outputChannel)
			}
		},
	)
}

function buildTerminalContext(activeTerminal: vscode.Terminal) {
	return {
		operatingSystem: process.platform,
		currentDirectory:
			activeTerminal.shellIntegration?.cwd?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "~",
		shell: process.env.SHELL || (process.platform === "win32" ? "cmd" : "bash"),
	}
}

async function getApiConfiguration(context: vscode.ExtensionContext): Promise<ProviderSettings> {
	const contextProxy = ContextProxy.instance
	if (!contextProxy) {
		throw new Error("ContextProxy not initialized")
	}

	const apiConfiguration = contextProxy.getProviderSettings()
	const terminalCommandApiConfigId = contextProxy.getValue("terminalCommandApiConfigId")
	const listApiConfigMeta = contextProxy.getValue("listApiConfigMeta") || []

	// Try to get terminal command specific config first, fall back to current config
	let configToUse: ProviderSettings = apiConfiguration

	if (
		terminalCommandApiConfigId &&
		listApiConfigMeta.find(({ id }: { id: string }) => id === terminalCommandApiConfigId)
	) {
		try {
			const providerSettingsManager = new ProviderSettingsManager(context)
			await providerSettingsManager.initialize()

			const { name: _, ...providerSettings } = await providerSettingsManager.getProfile({
				id: terminalCommandApiConfigId,
			})

			if (providerSettings.apiProvider) {
				configToUse = providerSettings
			}
		} catch (error) {
			// Fall back to default configuration if profile doesn't exist
			console.warn(`Failed to load terminal command API config ${terminalCommandApiConfigId}:`, error)
		}
	}

	if (!configToUse || !configToUse.apiProvider) {
		throw new Error("No valid API configuration available")
	}

	return configToUse
}

function cleanGeneratedCommand(generatedCommand: string): string {
	return generatedCommand
		.trim()
		.replace(/^```[\w]*\n?|```$/g, "")
		.trim()
}

function executeCommandInTerminal(activeTerminal: vscode.Terminal, command: string): void {
	activeTerminal.sendText(command)
	activeTerminal.show()
}

function showSuccessMessage(command: string): void {
	vscode.window.showInformationMessage(`Generated command: ${command}`)
}

function handleGenerationError(error: unknown, outputChannel: vscode.OutputChannel): void {
	const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
	outputChannel.appendLine(`Error generating terminal command: ${errorMessage}`)
	vscode.window.showErrorMessage(`Failed to generate command: ${errorMessage}`)
}
