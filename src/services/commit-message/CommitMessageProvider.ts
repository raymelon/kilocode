// kilocode_change - new file
import * as vscode from "vscode"
import { ContextProxy } from "../../core/config/ContextProxy"
import { ProviderSettingsManager } from "../../core/config/ProviderSettingsManager"
import { singleCompletionHandler } from "../../utils/single-completion-handler"
import { GitExtensionService, GitChange, GitProgressOptions, GitRepository } from "./GitExtensionService"
import { supportPrompt } from "../../shared/support-prompt"
import { t } from "../../i18n"
import { addCustomInstructions } from "../../core/prompts/sections/custom-instructions"
import { getWorkspacePath } from "../../utils/path"
import { TelemetryEventName, type ProviderSettings } from "@roo-code/types"
import delay from "delay"
import { TelemetryService } from "@roo-code/telemetry"
import {
	DiffChunk,
	chunkDiffByFiles,
	chunkDiffByHunks,
	shouldUseMapReduce,
	estimateTokenCount,
} from "../../utils/git-diff-chunker"

const DEFAULT_CONTEXT_WINDOW = 200000
const CONTEXT_WINDOW_THRESHOLD = 0.95
const MAX_CONCURRENT_CHUNKS = 3
const PROGRESS_WEIGHTS = {
	DIFF_COLLECTION: 70,
	MAPREDUCE_ANALYSIS: 60,
	MAPREDUCE_AGGREGATION: 10,
	AI_GENERATION: 20,
} as const

interface CommitContext {
	context: string
	tokenCount: number
	requiresChunking: boolean
	contextWindow?: number
}

/**
 * Provides AI-powered commit message generation for source control management.
 * Integrates with Git repositories to analyze staged changes and generate
 * conventional commit messages using AI.
 */
export class CommitMessageProvider {
	private gitService: GitExtensionService
	private providerSettingsManager: ProviderSettingsManager
	private previousGitContext: string | null = null
	private previousCommitMessage: string | null = null

	constructor(
		private context: vscode.ExtensionContext,
		private outputChannel: vscode.OutputChannel,
	) {
		this.gitService = new GitExtensionService()
		this.providerSettingsManager = new ProviderSettingsManager(this.context)
	}

	/**
	 * Activates the commit message provider by setting up Git integration.
	 */
	public async activate(): Promise<void> {
		this.outputChannel.appendLine(t("kilocode:commitMessage.activated"))

		try {
			await this.providerSettingsManager.initialize()
		} catch (error) {
			this.outputChannel.appendLine(t("kilocode:commitMessage.gitInitError", { error }))
		}

		// Register the command
		const disposable = vscode.commands.registerCommand(
			"kilo-code.generateCommitMessage",
			(commitContext?: GitRepository) => this.generateCommitMessage(commitContext),
		)
		this.context.subscriptions.push(disposable)
		this.context.subscriptions.push(this.gitService)
	}

	/**
	 * Generates an AI-powered commit message based on staged changes, or unstaged changes if no staged changes exist.
	 */
	public async generateCommitMessage(commitContext?: GitRepository): Promise<void> {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.SourceControl,
				title: t("kilocode:commitMessage.generating"),
				cancellable: false,
			},
			async (progress) => {
				try {
					this.gitService.configureRepositoryContext(commitContext?.rootUri)

					let staged = true
					let changes = await this.gitService.gatherChanges({ staged })

					if (changes.length === 0) {
						staged = false
						changes = await this.gitService.gatherChanges({ staged })
						if (changes.length > 0) {
							vscode.window.showInformationMessage(t("kilocode:commitMessage.generatingFromUnstaged"))
						} else {
							vscode.window.showInformationMessage(t("kilocode:commitMessage.noChanges"))
							return
						}
					}

					// Report initial progress after gathering changes (10% of total)
					progress.report({ increment: 10, message: t("kilocode:commitMessage.generating") })

					// Track progress for diff collection
					let lastReportedProgress = 0
					const onDiffProgress = (percentage: number) => {
						const progressWeight = PROGRESS_WEIGHTS.DIFF_COLLECTION
						const currentProgress = (percentage / 100) * progressWeight
						const increment = currentProgress - lastReportedProgress
						if (increment > 0) {
							progress.report({ increment, message: t("kilocode:commitMessage.generating") })
							lastReportedProgress = currentProgress
						}
					}

					const gitCommitContext = await this.buildCommitContext(changes, {
						staged,
						onProgress: onDiffProgress,
					})

					let generatedMessage: string

					if (gitCommitContext.requiresChunking) {
						generatedMessage = await this.generateCommitMessageMapReduce(gitCommitContext, progress)
					} else {
						generatedMessage = await this.callAIForCommitMessageWithProgress(
							gitCommitContext.context,
							progress,
						)
					}

					this.previousGitContext = gitCommitContext.context
					this.previousCommitMessage = generatedMessage
					this.gitService.setCommitMessage(generatedMessage)
					TelemetryService.instance.captureEvent(TelemetryEventName.COMMIT_MSG_GENERATED)
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
					vscode.window.showErrorMessage(t("kilocode:commitMessage.generationFailed", { errorMessage }))
					console.error("Error generating commit message:", error)
				}
			},
		)
	}

	private async callAIForCommitMessageWithProgress(
		gitContextString: string,
		progress: vscode.Progress<{ increment?: number; message?: string }>,
	): Promise<string> {
		let totalProgressUsed = 0
		const maxProgress = PROGRESS_WEIGHTS.AI_GENERATION
		const maxIncrement = 1.0
		const minIncrement = 0.05

		const progressInterval = setInterval(() => {
			const remainingProgress = (maxProgress - totalProgressUsed) / maxProgress

			const incrementLimited = Math.max(
				remainingProgress * remainingProgress * maxIncrement + minIncrement,
				minIncrement,
			)
			const increment = Math.min(incrementLimited, maxProgress - totalProgressUsed)
			progress.report({ increment: increment, message: t("kilocode:commitMessage.generating") })
			totalProgressUsed += increment
		}, 100)

		try {
			const message = await this.callAIForCommitMessage(gitContextString)

			for (let i = 0; i < maxProgress - totalProgressUsed; i++) {
				progress.report({ increment: 1 })
				await delay(25)
			}
			return message
		} finally {
			clearInterval(progressInterval)
		}
	}

	private async buildCommitContext(changes: GitChange[], options: GitProgressOptions): Promise<CommitContext> {
		const gitContextString = await this.gitService.buildGitContext(changes, options)
		const tokenCount = await estimateTokenCount(gitContextString)
		const contextWindow = DEFAULT_CONTEXT_WINDOW
		const requiresChunking = await shouldUseMapReduce(gitContextString, contextWindow, CONTEXT_WINDOW_THRESHOLD)

		return {
			context: gitContextString,
			tokenCount,
			requiresChunking,
			contextWindow,
		}
	}

	private async generateCommitMessageMapReduce(
		commitContext: CommitContext,
		progress: vscode.Progress<{ increment?: number; message?: string }>,
	): Promise<string> {
		const contextWindow = commitContext.contextWindow || DEFAULT_CONTEXT_WINDOW

		try {
			progress.report({ increment: 5, message: "Analyzing diff structure..." })

			const chunkingResult = await chunkDiffByFiles(commitContext.context, {
				contextWindow,
				targetChunkRatio: 0.2,
			})

			if (!chunkingResult.wasChunked || chunkingResult.chunks.length === 0) {
				throw new Error(
					"Failed to chunk diff for MapReduce processing. Diff may be too large or contain unsupported content.",
				)
			}

			progress.report({ increment: 5, message: `Analyzing ${chunkingResult.chunks.length} chunks...` })

			const chunkSummaries = await this.processChunksInParallel(
				chunkingResult.chunks,
				progress,
				PROGRESS_WEIGHTS.MAPREDUCE_ANALYSIS,
			)

			progress.report({ increment: 5, message: "Generating final commit message..." })

			const finalMessage = await this.aggregateChunkSummaries(chunkSummaries, commitContext)

			progress.report({ increment: PROGRESS_WEIGHTS.MAPREDUCE_AGGREGATION, message: "Commit message generated" })

			return finalMessage
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error occurred during MapReduce processing"

			// Provide graceful fallback with a generic commit message
			progress.report({ increment: 15, message: "Falling back to simple commit message..." })

			try {
				// Attempt to generate a simple commit message without MapReduce
				const fallbackMessage = await this.generateFallbackCommitMessage(commitContext)
				return fallbackMessage
			} catch (fallbackError) {
				throw new Error(`MapReduce commit message generation failed: ${errorMessage}. Fallback also failed.`)
			}
		}
	}

	private async generateFallbackCommitMessage(commitContext: CommitContext): Promise<string> {
		try {
			// Extract basic information from the context for a simple commit message
			const contextLines = commitContext.context.split("\n")
			const fileCount = (commitContext.context.match(/diff --git/g) || []).length

			if (fileCount === 0) {
				return "chore: update files\n\nNo specific changes detected, manual review recommended"
			}

			// Generate a basic commit message based on file count and context
			const commitType = fileCount > 5 ? "refactor" : "feat"
			const scope = fileCount === 1 ? "single file" : `${fileCount} files`

			return `${commitType}: update ${scope}\n\nMapReduce processing failed, generated fallback commit message`
		} catch (error) {
			return "chore: update files\n\nAutomatic commit message generation failed, manual review required"
		}
	}

	private async processChunksInParallel(
		chunks: DiffChunk[],
		progress: vscode.Progress<{ increment?: number; message?: string }>,
		progressWeight: number,
	): Promise<DiffChunk[]> {
		const progressPerChunk = progressWeight / chunks.length
		let completedChunks = 0

		const concurrencyLimit = Math.min(MAX_CONCURRENT_CHUNKS, chunks.length)
		const results: DiffChunk[] = []

		for (let i = 0; i < chunks.length; i += concurrencyLimit) {
			const batch = chunks.slice(i, i + concurrencyLimit)
			const batchPromises = batch.map(async (chunk) => {
				const analyzedChunk = await this.analyzeChunk(chunk)
				completedChunks++
				progress.report({
					increment: progressPerChunk,
					message: `Analyzed chunk ${completedChunks}/${chunks.length}`,
				})
				return analyzedChunk
			})

			const batchResults = await Promise.all(batchPromises)
			results.push(...batchResults)
		}

		return results
	}

	private async analyzeChunk(chunk: DiffChunk): Promise<DiffChunk> {
		try {
			const contextProxy = ContextProxy.instance
			const apiConfiguration = contextProxy.getProviderSettings()
			const customSupportPrompts = contextProxy.getValue("customSupportPrompts") || {}

			const workspacePath = getWorkspacePath()
			const customInstructions = workspacePath
				? await addCustomInstructions("", "", workspacePath, "commit", {
						language: vscode.env.language,
						localRulesToggleState: this.context.workspaceState.get("localRulesToggles"),
						globalRulesToggleState: this.context.globalState.get("globalRulesToggles"),
					})
				: ""

			const prompt = supportPrompt.create(
				"COMMIT_MESSAGE",
				{
					gitContext: "",
					customInstructions: customInstructions || "",
					mode: "CHUNK",
					diffChunk: `\`\`\`diff\n${chunk.diff}\n\`\`\``,
					chunkSummaries: "", // Not used in chunk mode
				},
				customSupportPrompts,
			)

			const response = await singleCompletionHandler(apiConfiguration, prompt)
			const summary = this.extractChunkSummary(response)

			return {
				...chunk,
				summary,
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"

			const fileTypes = chunk.files.map((f) => f.split(".").pop()).filter(Boolean)
			const uniqueTypes = [...new Set(fileTypes)]
			const scope = chunk.files[0] ? chunk.files[0].split("/")[0] : "multiple"

			return {
				...chunk,
				summary: `**Type**: chore\n**Scope**: ${scope}\n**Summary**: update ${chunk.files.length} ${uniqueTypes.join(", ")} file(s)\n**Details**: Chunk analysis failed (${errorMessage}), manual review recommended`,
			}
		}
	}

	private async aggregateChunkSummaries(chunks: DiffChunk[], commitContext: CommitContext): Promise<string> {
		try {
			const contextProxy = ContextProxy.instance
			const apiConfiguration = contextProxy.getProviderSettings()
			const customSupportPrompts = contextProxy.getValue("customSupportPrompts") || {}

			const workspacePath = getWorkspacePath()
			const customInstructions = workspacePath
				? await addCustomInstructions("", "", workspacePath, "commit", {
						language: vscode.env.language,
						localRulesToggleState: this.context.workspaceState.get("localRulesToggles"),
						globalRulesToggleState: this.context.globalState.get("globalRulesToggles"),
					})
				: ""

			const chunkSummariesText = chunks
				.filter((chunk) => chunk.summary)
				.map((chunk, index) => {
					return `## Chunk ${index + 1} (${chunk.files.join(", ")})\n${chunk.summary}`
				})
				.join("\n\n")

			const shouldGenerateDifferentMessage =
				this.previousGitContext === commitContext.context && this.previousCommitMessage !== null

			let prompt: string
			if (shouldGenerateDifferentMessage) {
				const differentMessagePrefix = `# CRITICAL INSTRUCTION: GENERATE A COMPLETELY DIFFERENT COMMIT MESSAGE
The user has requested a new commit message for the same changes.
The previous message was: "${this.previousCommitMessage}"
YOU MUST create a message that is COMPLETELY DIFFERENT by:
- Using entirely different wording and phrasing
- Focusing on different aspects of the changes
- Using a different structure or format if appropriate
- Possibly using a different type or scope if justifiable
This is the MOST IMPORTANT requirement for this task.

`
				const baseTemplate = supportPrompt.get(customSupportPrompts, "COMMIT_MESSAGE")
				const modifiedTemplate =
					differentMessagePrefix +
					baseTemplate +
					`

FINAL REMINDER: Your message MUST be COMPLETELY DIFFERENT from the previous message: "${this.previousCommitMessage}". This is a critical requirement.`

				prompt = supportPrompt.create(
					"COMMIT_MESSAGE",
					{
						gitContext: "",
						customInstructions: customInstructions || "",
						mode: "AGGREGATE",
						diffChunk: "", // Not used in aggregate mode
						chunkSummaries: chunkSummariesText,
					},
					{
						...customSupportPrompts,
						COMMIT_MESSAGE: modifiedTemplate,
					},
				)
			} else {
				prompt = supportPrompt.create(
					"COMMIT_MESSAGE",
					{
						gitContext: "",
						customInstructions: customInstructions || "",
						mode: "AGGREGATE",
						diffChunk: "", // Not used in aggregate mode
						chunkSummaries: chunkSummariesText,
					},
					customSupportPrompts,
				)
			}

			const response = await singleCompletionHandler(apiConfiguration, prompt)
			return this.extractCommitMessage(response)
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
			console.error("Failed to aggregate chunk summaries:", errorMessage)

			// Generate a fallback commit message based on chunk summaries
			const fileCount = chunks.reduce((sum, chunk) => sum + chunk.files.length, 0)
			const commitType = fileCount > 5 ? "refactor" : "feat"
			const scope = fileCount === 1 ? "single file" : `${fileCount} files`

			return `${commitType}: update ${scope}\n\nAggregation failed (${errorMessage}), manual review recommended`
		}
	}

	private extractChunkSummary(response: string): string {
		// Clean up the response by removing any extra whitespace or formatting
		const cleaned = response.trim()

		// Remove any code block markers
		const withoutCodeBlocks = cleaned.replace(/```[a-z]*\n|```/g, "")

		// Remove any quotes or backticks that might wrap the message
		const withoutQuotes = withoutCodeBlocks.replace(/^["'`]|["'`]$/g, "")

		return withoutQuotes.trim()
	}

	/**
	 * Calls the provider to generate a commit message based on the git context.
	 */
	private async callAIForCommitMessage(gitContextString: string): Promise<string> {
		const contextProxy = ContextProxy.instance
		const apiConfiguration = contextProxy.getProviderSettings()
		const commitMessageApiConfigId = contextProxy.getValue("commitMessageApiConfigId")
		const listApiConfigMeta = contextProxy.getValue("listApiConfigMeta") || []
		const customSupportPrompts = contextProxy.getValue("customSupportPrompts") || {}

		// Try to get commit message config first, fall back to current config.
		let configToUse: ProviderSettings = apiConfiguration

		if (
			commitMessageApiConfigId &&
			listApiConfigMeta.find(({ id }: { id: string }) => id === commitMessageApiConfigId)
		) {
			try {
				const { name: _, ...providerSettings } = await this.providerSettingsManager.getProfile({
					id: commitMessageApiConfigId,
				})

				if (providerSettings.apiProvider) {
					configToUse = providerSettings
				}
			} catch (error) {
				// Fall back to default configuration if profile doesn't exist
				console.warn(`Failed to load commit message API config ${commitMessageApiConfigId}:`, error)
			}
		}

		const prompt = await this.buildCommitMessagePrompt(gitContextString, customSupportPrompts)

		const response = await singleCompletionHandler(configToUse, prompt)

		return this.extractCommitMessage(response)
	}

	/**
	 * Builds the AI prompt for commit message generation.
	 * Handles logic for generating different messages when requested for the same changes.
	 */
	private async buildCommitMessagePrompt(
		gitContextString: string,
		customSupportPrompts: Record<string, any>,
	): Promise<string> {
		// Load custom instructions including rules
		const workspacePath = getWorkspacePath()
		const customInstructions = workspacePath
			? await addCustomInstructions(
					"", // no mode-specific instructions for commit
					"", // no global custom instructions
					workspacePath,
					"commit", // mode for commit-specific rules
					{
						language: vscode.env.language,
						localRulesToggleState: this.context.workspaceState.get("localRulesToggles"),
						globalRulesToggleState: this.context.globalState.get("globalRulesToggles"),
					},
				)
			: ""

		// Check if we should generate a different message than the previous one
		const shouldGenerateDifferentMessage =
			this.previousGitContext === gitContextString && this.previousCommitMessage !== null

		// Create prompt with different message logic if needed
		if (shouldGenerateDifferentMessage) {
			const differentMessagePrefix = `# CRITICAL INSTRUCTION: GENERATE A COMPLETELY DIFFERENT COMMIT MESSAGE
The user has requested a new commit message for the same changes.
The previous message was: "${this.previousCommitMessage}"
YOU MUST create a message that is COMPLETELY DIFFERENT by:
- Using entirely different wording and phrasing
- Focusing on different aspects of the changes
- Using a different structure or format if appropriate
- Possibly using a different type or scope if justifiable
This is the MOST IMPORTANT requirement for this task.

`
			const baseTemplate = supportPrompt.get(customSupportPrompts, "COMMIT_MESSAGE")
			const modifiedTemplate =
				differentMessagePrefix +
				baseTemplate +
				`

FINAL REMINDER: Your message MUST be COMPLETELY DIFFERENT from the previous message: "${this.previousCommitMessage}". This is a critical requirement.`

			return supportPrompt.create(
				"COMMIT_MESSAGE",
				{
					gitContext: gitContextString,
					customInstructions: customInstructions || "",
					mode: "DIRECT",
				},
				{
					...customSupportPrompts,
					COMMIT_MESSAGE: modifiedTemplate,
				},
			)
		} else {
			return supportPrompt.create(
				"COMMIT_MESSAGE",
				{
					gitContext: gitContextString,
					customInstructions: customInstructions || "",
					mode: "DIRECT",
				},
				customSupportPrompts,
			)
		}
	}

	/**
	 * Extracts the commit message from the AI response.
	 */
	private extractCommitMessage(response: string): string {
		// Clean up the response by removing any extra whitespace or formatting
		const cleaned = response.trim()

		// Remove any code block markers
		const withoutCodeBlocks = cleaned.replace(/```[a-z]*\n|```/g, "")

		// Remove any quotes or backticks that might wrap the message
		const withoutQuotes = withoutCodeBlocks.replace(/^["'`]|["'`]$/g, "")

		return withoutQuotes.trim()
	}

	public dispose() {
		this.gitService.dispose()
	}
}
