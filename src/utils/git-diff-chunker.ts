import { countTokens } from "./countTokens"

export interface DiffChunk {
	id: string
	diff: string
	files: string[]
	summary?: string
	tokenCount: number
}

export interface ChunkingOptions {
	contextWindow: number
	targetChunkRatio?: number
	maxChunks?: number
}

export interface ChunkingResult {
	chunks: DiffChunk[]
	wasChunked: boolean
	totalTokens: number
	originalTokenCount: number
}

/**
 * Estimates token count for a given text string
 */
export async function estimateTokenCount(text: string): Promise<number> {
	if (!text || text.trim().length === 0) {
		return 0
	}

	// Convert string to ContentBlockParam format expected by countTokens
	const contentBlocks = [{ type: "text" as const, text }]
	return await countTokens(contentBlocks, { useWorker: false })
}

/**
 * Determines if MapReduce approach should be used based on diff size
 */
export async function shouldUseMapReduce(
	diffText: string,
	contextWindow: number = 200000,
	threshold: number = 0.95,
): Promise<boolean> {
	const tokenCount = await estimateTokenCount(diffText)
	const maxTokens = contextWindow * threshold
	return tokenCount > maxTokens
}

/**
 * Chunks a diff by files, grouping related files together
 */
export async function chunkDiffByFiles(diffText: string, options: ChunkingOptions): Promise<ChunkingResult> {
	const { contextWindow, targetChunkRatio = 0.2, maxChunks = 10 } = options
	const originalTokenCount = await estimateTokenCount(diffText)
	const targetChunkSize = Math.floor(contextWindow * targetChunkRatio)

	// Split diff into individual file diffs
	const fileDiffs = extractFileDiffs(diffText)

	if (fileDiffs.length === 0) {
		return {
			chunks: [],
			wasChunked: false,
			totalTokens: originalTokenCount,
			originalTokenCount,
		}
	}

	// If only one file or total size is small, don't chunk
	if (fileDiffs.length === 1 || originalTokenCount <= targetChunkSize) {
		const chunk: DiffChunk = {
			id: "chunk-1",
			diff: diffText,
			files: fileDiffs.map((fd) => fd.filePath),
			tokenCount: originalTokenCount,
		}

		return {
			chunks: [chunk],
			wasChunked: false,
			totalTokens: originalTokenCount,
			originalTokenCount,
		}
	}

	// Group files into chunks based on token size
	const chunks: DiffChunk[] = []
	let currentChunk: { files: FileDiff[]; tokenCount: number } = { files: [], tokenCount: 0 }
	let chunkIndex = 1

	for (const fileDiff of fileDiffs) {
		const fileTokens = await estimateTokenCount(fileDiff.diff)

		// If adding this file would exceed target size, finalize current chunk
		if (currentChunk.files.length > 0 && currentChunk.tokenCount + fileTokens > targetChunkSize) {
			const chunk = await createChunkFromFiles(currentChunk.files, chunkIndex++)
			chunks.push(chunk)
			currentChunk = { files: [], tokenCount: 0 }
		}

		currentChunk.files.push(fileDiff)
		currentChunk.tokenCount += fileTokens

		// Prevent too many chunks
		if (chunks.length >= maxChunks - 1) {
			break
		}
	}

	// Add remaining files to final chunk
	if (currentChunk.files.length > 0) {
		const chunk = await createChunkFromFiles(currentChunk.files, chunkIndex)
		chunks.push(chunk)
	}

	const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0)

	return {
		chunks,
		wasChunked: chunks.length > 1,
		totalTokens,
		originalTokenCount,
	}
}

/**
 * Chunks a diff by hunks within files for more granular analysis
 */
export async function chunkDiffByHunks(diffText: string, options: ChunkingOptions): Promise<ChunkingResult> {
	const { contextWindow, targetChunkRatio = 0.2, maxChunks = 15 } = options
	const originalTokenCount = await estimateTokenCount(diffText)
	const targetChunkSize = Math.floor(contextWindow * targetChunkRatio)

	// Extract file diffs first
	const fileDiffs = extractFileDiffs(diffText)

	if (fileDiffs.length === 0) {
		return {
			chunks: [],
			wasChunked: false,
			totalTokens: originalTokenCount,
			originalTokenCount,
		}
	}

	const chunks: DiffChunk[] = []
	let chunkIndex = 1

	for (const fileDiff of fileDiffs) {
		const hunks = extractHunksFromFile(fileDiff)

		if (hunks.length <= 1) {
			// Single hunk or no hunks, treat as one chunk
			const tokenCount = await estimateTokenCount(fileDiff.diff)
			const chunk: DiffChunk = {
				id: `chunk-${chunkIndex++}`,
				diff: fileDiff.diff,
				files: [fileDiff.filePath],
				tokenCount,
			}
			chunks.push(chunk)
		} else {
			// Multiple hunks, group them by target size
			let currentHunkGroup: string[] = []
			let currentTokenCount = 0

			for (const hunk of hunks) {
				const hunkTokens = await estimateTokenCount(hunk)

				if (currentHunkGroup.length > 0 && currentTokenCount + hunkTokens > targetChunkSize) {
					// Create chunk from current group
					const chunkDiff = createFileWithHunks(fileDiff, currentHunkGroup)
					const chunk: DiffChunk = {
						id: `chunk-${chunkIndex++}`,
						diff: chunkDiff,
						files: [fileDiff.filePath],
						tokenCount: currentTokenCount,
					}
					chunks.push(chunk)

					currentHunkGroup = []
					currentTokenCount = 0
				}

				currentHunkGroup.push(hunk)
				currentTokenCount += hunkTokens

				if (chunks.length >= maxChunks - 1) {
					break
				}
			}

			// Add remaining hunks
			if (currentHunkGroup.length > 0) {
				const chunkDiff = createFileWithHunks(fileDiff, currentHunkGroup)
				const chunk: DiffChunk = {
					id: `chunk-${chunkIndex++}`,
					diff: chunkDiff,
					files: [fileDiff.filePath],
					tokenCount: currentTokenCount,
				}
				chunks.push(chunk)
			}
		}

		if (chunks.length >= maxChunks) {
			break
		}
	}

	const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0)

	return {
		chunks,
		wasChunked: chunks.length > 1,
		totalTokens,
		originalTokenCount,
	}
}

// Helper interfaces and functions

interface FileDiff {
	filePath: string
	diff: string
	header: string
}

function extractFileDiffs(diffText: string): FileDiff[] {
	const fileDiffs: FileDiff[] = []
	const lines = diffText.split("\n")
	let currentFile: FileDiff | null = null
	let currentDiffLines: string[] = []

	for (const line of lines) {
		if (line.startsWith("diff --git")) {
			// Save previous file if exists
			if (currentFile) {
				currentFile.diff = currentDiffLines.join("\n")
				fileDiffs.push(currentFile)
			}

			// Start new file
			const match = line.match(/diff --git a\/(.+) b\/(.+)/)
			const filePath = match ? match[1] : "unknown"

			currentFile = {
				filePath,
				diff: "",
				header: line,
			}
			currentDiffLines = [line]
		} else if (currentFile) {
			currentDiffLines.push(line)
		}
	}

	// Add final file
	if (currentFile) {
		currentFile.diff = currentDiffLines.join("\n")
		fileDiffs.push(currentFile)
	}

	return fileDiffs
}

function extractHunksFromFile(fileDiff: FileDiff): string[] {
	const lines = fileDiff.diff.split("\n")
	const hunks: string[] = []
	let currentHunk: string[] = []
	let inHunk = false

	for (const line of lines) {
		if (line.startsWith("@@")) {
			// Save previous hunk
			if (inHunk && currentHunk.length > 0) {
				hunks.push(currentHunk.join("\n"))
			}

			// Start new hunk
			currentHunk = [line]
			inHunk = true
		} else if (inHunk) {
			currentHunk.push(line)
		}
	}

	// Add final hunk
	if (inHunk && currentHunk.length > 0) {
		hunks.push(currentHunk.join("\n"))
	}

	return hunks
}

async function createChunkFromFiles(files: FileDiff[], chunkIndex: number): Promise<DiffChunk> {
	const combinedDiff = files.map((f) => f.diff).join("\n\n")
	const filePaths = files.map((f) => f.filePath)
	const tokenCount = await estimateTokenCount(combinedDiff)

	return {
		id: `chunk-${chunkIndex}`,
		diff: combinedDiff,
		files: filePaths,
		tokenCount,
	}
}

function createFileWithHunks(fileDiff: FileDiff, hunks: string[]): string {
	const lines = fileDiff.diff.split("\n")
	const headerLines: string[] = []

	// Extract header lines (everything before first @@)
	for (const line of lines) {
		if (line.startsWith("@@")) {
			break
		}
		headerLines.push(line)
	}

	// Combine header with selected hunks
	return [...headerLines, ...hunks].join("\n")
}
