import * as vscode from "vscode"
import { CommitMessageProvider } from "../CommitMessageProvider"
import { GitExtensionService, GitChange } from "../GitExtensionService"
import { singleCompletionHandler } from "../../../utils/single-completion-handler"
import * as gitDiffChunker from "../../../utils/git-diff-chunker"
import type { Mock } from "vitest"

// Mock dependencies
vi.mock("../../../core/config/ContextProxy", () => {
	const mockContextProxy = {
		getProviderSettings: vi.fn().mockReturnValue({
			kilocodeToken: "mock-token",
		}),
		getValue: vi.fn().mockImplementation((key: string) => {
			switch (key) {
				case "commitMessageApiConfigId":
					return undefined
				case "listApiConfigMeta":
					return []
				case "customSupportPrompts":
					return {}
				default:
					return undefined
			}
		}),
	}

	return {
		ContextProxy: {
			get instance() {
				return mockContextProxy
			},
		},
	}
})

vi.mock("../../../utils/single-completion-handler")
vi.mock("../GitExtensionService")
vi.mock("../../../utils/git-diff-chunker")
vi.mock("../../../core/prompts/sections/custom-instructions", () => ({
	addCustomInstructions: vi.fn().mockResolvedValue(""),
}))
vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn().mockReturnValue("/mock/workspace"),
}))
vi.mock("../../../shared/support-prompt", () => ({
	supportPrompt: {
		get: vi.fn().mockReturnValue("Mock MapReduce template with ${mode} and ${diffChunk} and ${chunkSummaries}"),
		create: vi.fn().mockReturnValue("Mock generated MapReduce prompt"),
	},
}))
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		withProgress: vi.fn().mockImplementation((_, callback) => callback({ report: vi.fn() })),
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/mock/workspace" } }],
	},
	commands: {
		registerCommand: vi.fn(),
	},
	env: {
		language: "en",
	},
	ExtensionContext: vi.fn(),
	OutputChannel: vi.fn(),
	ProgressLocation: {
		SourceControl: 1,
		Window: 2,
		Notification: 3,
	},
}))

describe("CommitMessageProvider MapReduce", () => {
	let commitMessageProvider: CommitMessageProvider
	let mockContext: vscode.ExtensionContext
	let mockOutputChannel: vscode.OutputChannel
	let mockGitService: GitExtensionService

	beforeEach(async () => {
		mockContext = {
			workspaceState: { get: vi.fn().mockReturnValue(undefined) },
			globalState: { get: vi.fn().mockReturnValue(undefined) },
		} as unknown as vscode.ExtensionContext
		mockOutputChannel = {
			appendLine: vi.fn(),
		} as unknown as vscode.OutputChannel

		// Setup GitExtensionService mock
		mockGitService = new GitExtensionService()
		mockGitService.gatherChanges = vi.fn()
		mockGitService.setCommitMessage = vi.fn()
		mockGitService.configureRepositoryContext = vi.fn()
		mockGitService.buildGitContext = vi.fn().mockReturnValue("Large diff content that requires chunking")

		// Setup git-diff-chunker mocks
		vi.mocked(gitDiffChunker.estimateTokenCount).mockResolvedValue(1000)
		vi.mocked(gitDiffChunker.shouldUseMapReduce).mockResolvedValue(false) // Default to false
		vi.mocked(gitDiffChunker.chunkDiffByFiles).mockResolvedValue({
			chunks: [
				{
					id: "chunk-1",
					diff: "mock diff chunk 1",
					files: ["file1.ts"],
					tokenCount: 500,
				},
				{
					id: "chunk-2",
					diff: "mock diff chunk 2",
					files: ["file2.ts"],
					tokenCount: 500,
				},
			],
			wasChunked: true,
			totalTokens: 1000,
			originalTokenCount: 1000,
		})

		// Setup singleCompletionHandler mock
		vi.mocked(singleCompletionHandler).mockResolvedValue(
			"feat(commit): implement MapReduce commit message generation",
		)

		// Create CommitMessageProvider instance
		commitMessageProvider = new CommitMessageProvider(mockContext, mockOutputChannel)
		;(commitMessageProvider as any).gitService = mockGitService
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("buildCommitContext", () => {
		it("should build commit context and determine chunking requirement", async () => {
			const mockChanges: GitChange[] = [{ filePath: "file1.ts", status: "Modified" }]

			vi.mocked(gitDiffChunker.shouldUseMapReduce).mockResolvedValue(true)

			const buildCommitContext = (commitMessageProvider as any).buildCommitContext
			const result = await buildCommitContext.call(commitMessageProvider, mockChanges, { staged: true })

			expect(result).toEqual({
				context: "Large diff content that requires chunking",
				tokenCount: 1000,
				requiresChunking: true,
				contextWindow: 200000,
			})
		})

		it("should not require chunking for small diffs", async () => {
			const mockChanges: GitChange[] = [{ filePath: "file1.ts", status: "Modified" }]

			vi.mocked(gitDiffChunker.estimateTokenCount).mockResolvedValue(100)
			vi.mocked(gitDiffChunker.shouldUseMapReduce).mockResolvedValue(false)

			const buildCommitContext = (commitMessageProvider as any).buildCommitContext
			const result = await buildCommitContext.call(commitMessageProvider, mockChanges, { staged: true })

			expect(result.requiresChunking).toBe(false)
		})
	})

	describe("generateCommitMessageMapReduce", () => {
		it("should generate commit message using MapReduce workflow", async () => {
			const mockCommitContext = {
				context: "Large diff content",
				tokenCount: 200000,
				requiresChunking: true,
				contextWindow: 200000,
			}

			const mockProgress = { report: vi.fn() }

			// Mock chunk analysis responses
			vi.mocked(singleCompletionHandler)
				.mockResolvedValueOnce("**Type**: feat\n**Scope**: api\n**Summary**: add new endpoint")
				.mockResolvedValueOnce("**Type**: test\n**Scope**: api\n**Summary**: add tests for endpoint")
				.mockResolvedValueOnce("feat(api): add new endpoint with comprehensive tests")

			const generateCommitMessageMapReduce = (commitMessageProvider as any).generateCommitMessageMapReduce
			const result = await generateCommitMessageMapReduce.call(
				commitMessageProvider,
				mockCommitContext,
				mockProgress,
			)

			expect(result).toBe("feat(api): add new endpoint with comprehensive tests")
			expect(mockProgress.report).toHaveBeenCalledWith(
				expect.objectContaining({ message: "Analyzing diff structure..." }),
			)
			expect(gitDiffChunker.chunkDiffByFiles).toHaveBeenCalledWith(
				mockCommitContext.context,
				expect.objectContaining({ contextWindow: 200000 }),
			)
		})

		it("should handle chunking failure gracefully", async () => {
			const mockCommitContext = {
				context: "Large diff content",
				tokenCount: 200000,
				requiresChunking: true,
				contextWindow: 200000,
			}

			const mockProgress = { report: vi.fn() }

			// Mock chunking failure
			vi.mocked(gitDiffChunker.chunkDiffByFiles).mockResolvedValue({
				chunks: [],
				wasChunked: false,
				totalTokens: 0,
				originalTokenCount: 200000,
			})

			const generateCommitMessageMapReduce = (commitMessageProvider as any).generateCommitMessageMapReduce
			const result = await generateCommitMessageMapReduce.call(
				commitMessageProvider,
				mockCommitContext,
				mockProgress,
			)

			// Should return fallback message
			expect(result).toContain("No specific changes detected")
			expect(mockProgress.report).toHaveBeenCalledWith(
				expect.objectContaining({ message: "Falling back to simple commit message..." }),
			)
		})

		it("should handle AI analysis errors gracefully", async () => {
			const mockCommitContext = {
				context: "Large diff content",
				tokenCount: 200000,
				requiresChunking: true,
				contextWindow: 200000,
			}

			const mockProgress = { report: vi.fn() }

			// Mock AI failure
			vi.mocked(singleCompletionHandler).mockRejectedValue(new Error("AI service unavailable"))

			const generateCommitMessageMapReduce = (commitMessageProvider as any).generateCommitMessageMapReduce
			const result = await generateCommitMessageMapReduce.call(
				commitMessageProvider,
				mockCommitContext,
				mockProgress,
			)

			// Should return fallback message
			expect(result).toContain("Aggregation failed")
		})
	})

	describe("processChunksInParallel", () => {
		it("should process chunks in parallel with concurrency limit", async () => {
			const mockChunks = [
				{ id: "chunk-1", diff: "diff1", files: ["file1.ts"], tokenCount: 500 },
				{ id: "chunk-2", diff: "diff2", files: ["file2.ts"], tokenCount: 500 },
				{ id: "chunk-3", diff: "diff3", files: ["file3.ts"], tokenCount: 500 },
				{ id: "chunk-4", diff: "diff4", files: ["file4.ts"], tokenCount: 500 },
			]

			const mockProgress = { report: vi.fn() }

			// Mock AI responses for chunk analysis
			vi.mocked(singleCompletionHandler).mockResolvedValue(
				"**Type**: feat\n**Scope**: test\n**Summary**: mock analysis",
			)

			const processChunksInParallel = (commitMessageProvider as any).processChunksInParallel
			const result = await processChunksInParallel.call(
				commitMessageProvider,
				mockChunks,
				mockProgress,
				60, // progressWeight
			)

			expect(result).toHaveLength(4)
			expect(result[0].summary).toContain("**Type**: feat")
			expect(mockProgress.report).toHaveBeenCalledTimes(4) // Once per chunk
		})
	})

	describe("analyzeChunk", () => {
		it("should analyze individual chunk and return summary", async () => {
			const mockChunk = {
				id: "chunk-1",
				diff: "mock diff content",
				files: ["file1.ts"],
				tokenCount: 500,
			}

			vi.mocked(singleCompletionHandler).mockResolvedValue(
				"**Type**: feat\n**Scope**: api\n**Summary**: add new feature\n**Details**: Detailed explanation",
			)

			const analyzeChunk = (commitMessageProvider as any).analyzeChunk
			const result = await analyzeChunk.call(commitMessageProvider, mockChunk)

			expect(result.summary).toContain("**Type**: feat")
			expect(result.summary).toContain("**Scope**: api")
			expect(singleCompletionHandler).toHaveBeenCalledWith(
				expect.any(Object),
				expect.stringContaining("Mock generated MapReduce prompt"),
			)
		})

		it("should provide fallback summary on analysis failure", async () => {
			const mockChunk = {
				id: "chunk-1",
				diff: "mock diff content",
				files: ["file1.ts", "file2.js"],
				tokenCount: 500,
			}

			vi.mocked(singleCompletionHandler).mockRejectedValue(new Error("Analysis failed"))

			const analyzeChunk = (commitMessageProvider as any).analyzeChunk
			const result = await analyzeChunk.call(commitMessageProvider, mockChunk)

			expect(result.summary).toContain("**Type**: chore")
			expect(result.summary).toContain("Chunk analysis failed")
			expect(result.summary).toContain("manual review recommended")
		})
	})

	describe("aggregateChunkSummaries", () => {
		it("should aggregate chunk summaries into final commit message", async () => {
			const mockChunks = [
				{
					id: "chunk-1",
					diff: "diff1",
					files: ["file1.ts"],
					tokenCount: 500,
					summary: "**Type**: feat\n**Scope**: api\n**Summary**: add endpoint",
				},
				{
					id: "chunk-2",
					diff: "diff2",
					files: ["file2.ts"],
					tokenCount: 500,
					summary: "**Type**: test\n**Scope**: api\n**Summary**: add tests",
				},
			]

			const mockCommitContext = {
				context: "Large diff content",
				tokenCount: 1000,
				requiresChunking: true,
			}

			vi.mocked(singleCompletionHandler).mockResolvedValue(
				"feat(api): add endpoint with comprehensive tests\n\nImplemented new API endpoint and added corresponding test coverage.",
			)

			const aggregateChunkSummaries = (commitMessageProvider as any).aggregateChunkSummaries
			const result = await aggregateChunkSummaries.call(commitMessageProvider, mockChunks, mockCommitContext)

			expect(result).toContain("feat(api): add endpoint with comprehensive tests")
			expect(singleCompletionHandler).toHaveBeenCalledWith(
				expect.any(Object),
				expect.stringContaining("Mock generated MapReduce prompt"),
			)
		})

		it("should provide fallback message on aggregation failure", async () => {
			const mockChunks = [
				{
					id: "chunk-1",
					diff: "diff1",
					files: ["file1.ts", "file2.ts", "file3.ts"],
					tokenCount: 500,
					summary: "mock summary",
				},
			]

			const mockCommitContext = {
				context: "Large diff content",
				tokenCount: 1000,
				requiresChunking: true,
			}

			vi.mocked(singleCompletionHandler).mockRejectedValue(new Error("Aggregation failed"))

			const aggregateChunkSummaries = (commitMessageProvider as any).aggregateChunkSummaries
			const result = await aggregateChunkSummaries.call(commitMessageProvider, mockChunks, mockCommitContext)

			expect(result).toContain("feat: update 3 files")
			expect(result).toContain("Aggregation failed")
			expect(result).toContain("manual review recommended")
		})
	})

	describe("integration with existing workflow", () => {
		it("should use MapReduce when diff is large", async () => {
			const mockChanges: GitChange[] = [
				{ filePath: "file1.ts", status: "Modified" },
				{ filePath: "file2.ts", status: "Added" },
			]

			vi.mocked(mockGitService.gatherChanges).mockResolvedValue(mockChanges)
			vi.mocked(gitDiffChunker.shouldUseMapReduce).mockResolvedValue(true)

			// Mock successful MapReduce workflow
			vi.mocked(singleCompletionHandler)
				.mockResolvedValueOnce("**Type**: feat\n**Summary**: chunk 1")
				.mockResolvedValueOnce("**Type**: feat\n**Summary**: chunk 2")
				.mockResolvedValueOnce("feat(api): implement new features")

			await commitMessageProvider.generateCommitMessage()

			expect(gitDiffChunker.shouldUseMapReduce).toHaveBeenCalled()
			expect(gitDiffChunker.chunkDiffByFiles).toHaveBeenCalled()
			expect(mockGitService.setCommitMessage).toHaveBeenCalledWith("feat(api): implement new features")
		})

		it("should use regular workflow when diff is small", async () => {
			const mockChanges: GitChange[] = [{ filePath: "file1.ts", status: "Modified" }]

			vi.mocked(mockGitService.gatherChanges).mockResolvedValue(mockChanges)
			vi.mocked(gitDiffChunker.shouldUseMapReduce).mockResolvedValue(false)
			vi.mocked(singleCompletionHandler).mockResolvedValue("fix(ui): correct button alignment")

			await commitMessageProvider.generateCommitMessage()

			expect(gitDiffChunker.shouldUseMapReduce).toHaveBeenCalled()
			expect(gitDiffChunker.chunkDiffByFiles).not.toHaveBeenCalled()
			expect(mockGitService.setCommitMessage).toHaveBeenCalledWith("fix(ui): correct button alignment")
		})
	})
})
