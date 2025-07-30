import * as vscode from "vscode"
import { ContextProxy } from "../core/config/ContextProxy"
import { ProviderSettingsManager } from "../core/config/ProviderSettingsManager"
import { supportPrompt } from "../shared/support-prompt"
import { singleCompletionHandler } from "./single-completion-handler"
import type { ProviderSettings } from "@roo-code/types"
import { t } from "../i18n"

export interface TerminalCommandGeneratorOptions {
	outputChannel: vscode.OutputChannel
	context: vscode.ExtensionContext
}

export async function generateTerminalCommand(options: TerminalCommandGeneratorOptions): Promise<void> {
	const { outputChannel, context } = options

	try {
		const userInput = await vscode.window.showInputBox({
			prompt: t("kilocode.terminalCommandGenerator.inputPrompt"),
			placeHolder: t("kilocode.terminalCommandGenerator.inputPlaceholder"),
			ignoreFocusOut: true,
		})

		if (!userInput) {
			return
		}

		const activeTerminal = vscode.window.activeTerminal
		if (!activeTerminal) {
			vscode.window.showErrorMessage(t("kilocode.terminalCommandGenerator.noActiveTerminal"))
			return
		}

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: t("kilocode.terminalCommandGenerator.generatingProgress"),
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
					const cleanCommand = generatedCommand
						.trim()
						.replace(/^```[\w]*\n?|```$/g, "")
						.trim()

					activeTerminal.sendText(cleanCommand, false)
					activeTerminal.show()
					vscode.window.showInformationMessage(
						t("kilocode.terminalCommandGenerator.commandGenerated", { command: cleanCommand }),
					)
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
					outputChannel.appendLine(`Error generating terminal command: ${errorMessage}`)
					vscode.window.showErrorMessage(
						t("kilocode.terminalCommandGenerator.generationFailed", { error: errorMessage }),
					)
				}
			},
		)
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
		outputChannel.appendLine(`Error in generateTerminalCommand: ${errorMessage}`)
		vscode.window.showErrorMessage(`Error: ${errorMessage}`)
	}
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
			console.warn(`Failed to load terminal command API config ${terminalCommandApiConfigId}:`, error)
		}
	}

	if (!configToUse || !configToUse.apiProvider) {
		throw new Error("No valid API configuration available")
	}

	return configToUse
}
