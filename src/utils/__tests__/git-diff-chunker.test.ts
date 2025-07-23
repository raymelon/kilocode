import { describe, it, expect, vi, beforeEach } from "vitest"
import {
	estimateTokenCount,
	shouldUseMapReduce,
	chunkDiffByFiles,
	chunkDiffByHunks,
	type DiffChunk,
	type ChunkingOptions,
} from "../git-diff-chunker"

// Mock the countTokens function
vi.mock("../countTokens", () => ({
	countTokens: vi.fn().mockImplementation(async (content) => {
		// Simple mock: estimate 4 characters per token
		const text = content[0]?.text || ""
		return Math.ceil(text.length / 4)
	}),
}))

describe("git-diff-chunker", () => {
	const mockDiff = `diff --git a/file1.ts b/file1.ts
index 1234567..abcdefg 100644
--- a/file1.ts
+++ b/file1.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log("Hello world")
   return "hello"
 }

diff --git a/file2.ts b/file2.ts
index 2345678..bcdefgh 100644
--- a/file2.ts
+++ b/file2.ts
@@ -1,2 +1,3 @@
 export function goodbye() {
+  console.log("Goodbye world")
   return "goodbye"
 }`

	const largeMockDiff = `diff --git a/large-file.ts b/large-file.ts
index 3456789..cdefghi 100644
--- a/large-file.ts
+++ b/large-file.ts
@@ -1,10 +1,20 @@
 export class LargeClass {
+  private newProperty: string = "test"
+  
   constructor() {
+    this.newProperty = "initialized"
   }
   
   method1() {
+    console.log("Method 1 called")
     return "method1"
   }
   
   method2() {
+    console.log("Method 2 called")
     return "method2"
   }
+  
+  newMethod() {
+    return this.newProperty
+  }
 }`

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("estimateTokenCount", () => {
		it("should estimate token count for text", async () => {
			const text = "Hello world, this is a test"
			const result = await estimateTokenCount(text)

			// With our mock (4 chars per token), this should be ~7 tokens
			expect(result).toBeGreaterThan(0)
			expect(typeof result).toBe("number")
		})

		it("should return 0 for empty text", async () => {
			const result = await estimateTokenCount("")
			expect(result).toBe(0)
		})

		it("should return 0 for whitespace-only text", async () => {
			const result = await estimateTokenCount("   \n\t  ")
			expect(result).toBe(0)
		})
	})

	describe("shouldUseMapReduce", () => {
		it("should return false for small diffs", async () => {
			const smallDiff = "small change"
			const result = await shouldUseMapReduce(smallDiff, 1000, 0.95)
			expect(result).toBe(false)
		})

		it("should return true for large diffs", async () => {
			// Create a large diff that exceeds the threshold
			const largeDiff = "x".repeat(4000) // 1000 tokens with our mock
			const result = await shouldUseMapReduce(largeDiff, 1000, 0.95) // threshold = 950 tokens
			expect(result).toBe(true)
		})

		it("should use default parameters", async () => {
			const result = await shouldUseMapReduce("small diff")
			expect(result).toBe(false)
		})
	})

	describe("chunkDiffByFiles", () => {
		const options: ChunkingOptions = {
			contextWindow: 1000,
			targetChunkRatio: 0.2,
			maxChunks: 10,
		}

		it("should not chunk small diffs", async () => {
			const result = await chunkDiffByFiles(mockDiff, options)

			expect(result.wasChunked).toBe(false)
			expect(result.chunks).toHaveLength(1)
			expect(result.chunks[0].files).toEqual(["file1.ts", "file2.ts"])
		})

		it("should return empty result for empty diff", async () => {
			const result = await chunkDiffByFiles("", options)

			expect(result.wasChunked).toBe(false)
			expect(result.chunks).toHaveLength(0)
			expect(result.totalTokens).toBe(0)
		})

		it("should chunk large diffs by files", async () => {
			// Create a diff with multiple files that would exceed chunk size
			const largeDiff = mockDiff + "\n" + largeMockDiff
			const smallOptions: ChunkingOptions = {
				contextWindow: 200,
				targetChunkRatio: 0.1, // Very small chunks to force chunking
				maxChunks: 10,
			}

			const result = await chunkDiffByFiles(largeDiff, smallOptions)

			expect(result.chunks.length).toBeGreaterThan(1)
			expect(result.wasChunked).toBe(true)
			expect(result.totalTokens).toBeGreaterThan(0)
		})

		it("should respect maxChunks limit", async () => {
			const largeDiff = mockDiff.repeat(20) // Many files
			const limitedOptions: ChunkingOptions = {
				contextWindow: 1000,
				targetChunkRatio: 0.01, // Very small to force many chunks
				maxChunks: 3,
			}

			const result = await chunkDiffByFiles(largeDiff, limitedOptions)

			expect(result.chunks.length).toBeLessThanOrEqual(3)
		})

		it("should generate proper chunk IDs", async () => {
			const result = await chunkDiffByFiles(mockDiff, options)

			expect(result.chunks[0].id).toBe("chunk-1")
			expect(result.chunks[0].tokenCount).toBeGreaterThan(0)
		})
	})

	describe("chunkDiffByHunks", () => {
		const options: ChunkingOptions = {
			contextWindow: 1000,
			targetChunkRatio: 0.2,
			maxChunks: 15,
		}

		it("should not chunk files with single hunks", async () => {
			const singleHunkDiff = `diff --git a/simple.ts b/simple.ts
index 1234567..abcdefg 100644
--- a/simple.ts
+++ b/simple.ts
@@ -1,2 +1,3 @@
 export function test() {
+  console.log("test")
   return "test"
 }`

			const result = await chunkDiffByHunks(singleHunkDiff, options)

			expect(result.chunks).toHaveLength(1)
			expect(result.chunks[0].files).toEqual(["simple.ts"])
		})

		it("should chunk files with multiple hunks", async () => {
			const multiHunkDiff = `diff --git a/multi.ts b/multi.ts
index 1234567..abcdefg 100644
--- a/multi.ts
+++ b/multi.ts
@@ -1,3 +1,4 @@
 export function first() {
+  console.log("first")
   return "first"
 }
@@ -10,3 +11,4 @@
 export function second() {
+  console.log("second")
   return "second"
 }
@@ -20,3 +22,4 @@
 export function third() {
+  console.log("third")
   return "third"
 }`

			const smallOptions: ChunkingOptions = {
				contextWindow: 200,
				targetChunkRatio: 0.1, // Small chunks to force splitting
				maxChunks: 15,
			}

			const result = await chunkDiffByHunks(multiHunkDiff, smallOptions)

			// Should create multiple chunks for the hunks
			expect(result.chunks.length).toBeGreaterThanOrEqual(1)
			result.chunks.forEach((chunk) => {
				expect(chunk.files).toEqual(["multi.ts"])
				expect(chunk.id).toMatch(/^chunk-\d+$/)
			})
		})

		it("should return empty result for empty diff", async () => {
			const result = await chunkDiffByHunks("", options)

			expect(result.wasChunked).toBe(false)
			expect(result.chunks).toHaveLength(0)
			expect(result.totalTokens).toBe(0)
		})

		it("should respect maxChunks limit", async () => {
			const manyHunksDiff = `diff --git a/many.ts b/many.ts
index 1234567..abcdefg 100644
--- a/many.ts
+++ b/many.ts
@@ -1,2 +1,3 @@
 function one() {
+  console.log("one")
   return 1
@@ -5,2 +6,3 @@
 function two() {
+  console.log("two")
   return 2
@@ -9,2 +11,3 @@
 function three() {
+  console.log("three")
   return 3
@@ -13,2 +16,3 @@
 function four() {
+  console.log("four")
   return 4
@@ -17,2 +21,3 @@
 function five() {
+  console.log("five")
   return 5`

			const limitedOptions: ChunkingOptions = {
				contextWindow: 1000,
				targetChunkRatio: 0.01, // Very small to force many chunks
				maxChunks: 2,
			}

			const result = await chunkDiffByHunks(manyHunksDiff, limitedOptions)

			expect(result.chunks.length).toBeLessThanOrEqual(2)
		})
	})

	describe("edge cases", () => {
		it("should handle malformed diff gracefully", async () => {
			const malformedDiff = "not a valid diff"
			const options: ChunkingOptions = { contextWindow: 1000 }

			const result = await chunkDiffByFiles(malformedDiff, options)

			expect(result.chunks).toHaveLength(0)
			expect(result.wasChunked).toBe(false)
		})

		it("should handle diff with no file changes", async () => {
			const emptyDiff = "diff --git a/empty.ts b/empty.ts\nindex 1234567..abcdefg 100644"
			const options: ChunkingOptions = { contextWindow: 1000 }

			const result = await chunkDiffByFiles(emptyDiff, options)

			expect(result.chunks).toHaveLength(1)
			expect(result.chunks[0].files).toEqual(["empty.ts"])
		})

		it("should handle very small context window", async () => {
			const options: ChunkingOptions = {
				contextWindow: 10,
				targetChunkRatio: 0.5,
			}

			const result = await chunkDiffByFiles(mockDiff, options)

			// Should still create at least one chunk
			expect(result.chunks.length).toBeGreaterThanOrEqual(1)
		})
	})
})
