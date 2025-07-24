// npx vitest run src/api/providers/__tests__/virtual.spec.ts

// Mock vscode first to avoid import errors
vitest.mock("vscode", () => ({
	globalState: {
		get: vitest.fn(),
		update: vitest.fn(),
	},
	workspace: {
		workspaceFolders: [
			{
				uri: {
					fsPath: "/test/path",
				},
			},
		],
	},
}))

import type { ExtensionContext } from "vscode"
import { ProviderSettingsManager } from "../../../core/config/ProviderSettingsManager"
import { ContextProxy } from "../../../core/config/ContextProxy"
import { buildApiHandler } from "../../index"
import { VirtualHandler } from "../virtual"
import { UsageEvent, UsageTracker } from "../../../utils/usage-tracker"

// Mock dependencies
vitest.mock("../../../core/config/ProviderSettingsManager")
vitest.mock("../../index")
vitest.mock("../../../core/config/ContextProxy")

describe("Virtual Provider Suite", () => {
	describe("UsageTracker", () => {
		let usageTracker: UsageTracker
		let mockContext: ExtensionContext

		beforeEach(() => {
			// Reset mocks and the singleton instance before each test
			vitest.clearAllMocks()
			;(UsageTracker as any)._instance = undefined

			mockContext = {
				globalState: {
					get: vitest.fn().mockReturnValue([]),
					update: vitest.fn(),
				},
			} as unknown as ExtensionContext

			usageTracker = UsageTracker.initialize(mockContext)
		})

		it("should initialize as a singleton", () => {
			const instance1 = UsageTracker.initialize(mockContext)
			const instance2 = UsageTracker.initialize(mockContext)
			expect(instance1).toBe(instance2)
		})

		it("should consume and record a token usage event", async () => {
			const providerId = "provider-1"
			const count = 100

			await usageTracker.consume(providerId, "tokens", count)

			const updatedEvents = (mockContext.globalState.update as any).mock.calls[0][1]
			expect(mockContext.globalState.update).toHaveBeenCalledTimes(1)
			expect(updatedEvents).toHaveLength(1)
			expect(updatedEvents[0]).toMatchObject({
				providerId,
				type: "tokens",
				count,
			})
		})

		it("should consume and record a request usage event", async () => {
			const providerId = "provider-2"
			await usageTracker.consume(providerId, "requests", 1)

			const updatedEvents = (mockContext.globalState.update as any).mock.calls[0][1]
			expect(mockContext.globalState.update).toHaveBeenCalledTimes(1)
			expect(updatedEvents).toHaveLength(1)
			expect(updatedEvents[0]).toMatchObject({
				providerId,
				type: "requests",
				count: 1,
			})
		})

		it("should correctly get usage for a specific provider and window", () => {
			const providerId = "provider-usage"
			const now = Date.now()
			const events: UsageEvent[] = [
				{ timestamp: now - 1000, providerId, type: "requests", count: 1 },
				{ timestamp: now - 2000, providerId, type: "tokens", count: 50 },
				{ timestamp: now - 65 * 1000, providerId, type: "requests", count: 1 }, // Older than a minute
				{ timestamp: now - 3000, providerId: "other-provider", type: "tokens", count: 200 },
			]
			;(mockContext.globalState.get as any).mockReturnValue(events)

			const usage = usageTracker.getUsage(providerId, "minute")

			expect(usage).toEqual({
				requests: 1,
				tokens: 50,
			})
		})

		it("should prune old events when consuming", async () => {
			const now = Date.now()
			const oneDayMs = 24 * 60 * 60 * 1000
			const oldEvent: UsageEvent = {
				timestamp: now - oneDayMs - 1000,
				providerId: "p1",
				type: "requests",
				count: 1,
			}
			const newEvent: UsageEvent = { timestamp: now, providerId: "p1", type: "tokens", count: 10 }
			;(mockContext.globalState.get as any).mockReturnValue([oldEvent])

			await usageTracker.consume("p1", "tokens", 10)

			const updatedEvents = (mockContext.globalState.update as any).mock.calls[0][1]
			expect(updatedEvents.find((e: UsageEvent) => e.timestamp === oldEvent.timestamp)).toBeUndefined()
			expect(updatedEvents.find((e: UsageEvent) => e.timestamp === newEvent.timestamp)).toBeDefined()
		})

		it("should clear all usage data", async () => {
			await usageTracker.clearAllUsageData()
			expect(mockContext.globalState.update).toHaveBeenCalledWith("kilocode.virtualprovider.usage.v1", undefined)
		})
	})

	describe("VirtualHandler", () => {
		let mockSettingsManager: {
			getProfile: any
		}
		const mockPrimaryProvider = { providerId: "p1", providerName: "primary" }
		const mockSecondaryProvider = { providerId: "p2", providerName: "secondary" }
		const mockBackupProvider = { providerId: "p3", providerName: "backup" }
		const mockPrimaryHandler = { getModel: () => ({ id: "primary-model" }) }
		const mockSecondaryHandler = { getModel: () => ({ id: "secondary-model" }) }
		const mockBackupHandler = { getModel: () => ({ id: "backup-model" }) }

		beforeEach(() => {
			vitest.clearAllMocks()

			// Mock the context proxy to return a mock context
			const mockContext = {
				globalState: {
					get: vitest.fn().mockReturnValue([]),
					update: vitest.fn(),
				},
			} as unknown as ExtensionContext
			vitest.spyOn(ContextProxy, "instance", "get").mockReturnValue({
				rawContext: mockContext,
			} as any)

			mockSettingsManager = {
				getProfile: vitest.fn(),
			}
			;(ProviderSettingsManager as any).mockImplementation(() => mockSettingsManager)
		})

		it("should load configured providers on initialization", async () => {
			;(mockSettingsManager.getProfile as any).mockImplementation(async ({ id }: { id: string }) => {
				if (id === "p1") return { id: "p1", name: "primary-profile" }
				if (id === "p2") return { id: "p2", name: "secondary-profile" }
				if (id === "p3") return { id: "p3", name: "backup-profile" }
				throw new Error("not found")
			})
			;(buildApiHandler as any).mockImplementation((profile: any) => {
				if (profile.id === "p1") return mockPrimaryHandler
				if (profile.id === "p2") return mockSecondaryHandler
				if (profile.id === "p3") return mockBackupHandler
				return undefined
			})

			const handler = new VirtualHandler({
				providers: [mockPrimaryProvider, mockSecondaryProvider, mockBackupProvider],
			} as any)

			// Allow async operations in constructor to complete
			await new Promise(process.nextTick)

			expect(mockSettingsManager.getProfile).toHaveBeenCalledTimes(3)
			expect(buildApiHandler).toHaveBeenCalledTimes(3)

			// Internal properties are used to verify handlers are set in the new array structure
			const handlers = (handler as any).handlers
			expect(handlers).toHaveLength(3)
			expect(handlers[0].handler).toBe(mockPrimaryHandler)
			expect(handlers[0].providerId).toBe("p1")
			expect(handlers[1].handler).toBe(mockSecondaryHandler)
			expect(handlers[1].providerId).toBe("p2")
			expect(handlers[2].handler).toBe(mockBackupHandler)
			expect(handlers[2].providerId).toBe("p3")
		})

		it("should handle errors when a provider fails to load", async () => {
			;(mockSettingsManager.getProfile as any).mockImplementation(async ({ id }: { id: string }) => {
				if (id === "p1") return { id: "p1", name: "primary-profile" }
				if (id === "p2") throw new Error("Failed to load profile")
				return { id: "p3", name: "backup-profile" }
			})
			;(buildApiHandler as any).mockImplementation((profile: any) => {
				if (profile.id === "p1") return mockPrimaryHandler
				if (profile.id === "p3") return mockBackupHandler
				return undefined
			})

			const consoleErrorSpy = vitest.spyOn(console, "error").mockImplementation(() => {})

			const handler = new VirtualHandler({
				providers: [mockPrimaryProvider, mockSecondaryProvider, mockBackupProvider],
			} as any)

			await new Promise(process.nextTick)

			// Check the new array structure - only successful handlers should be loaded
			const handlers = (handler as any).handlers
			expect(handlers).toHaveLength(2) // Only primary and backup loaded
			expect(handlers[0].handler).toBe(mockPrimaryHandler)
			expect(handlers[0].providerId).toBe("p1")
			expect(handlers[1].handler).toBe(mockBackupHandler)
			expect(handlers[1].providerId).toBe("p3")
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"  ❌ Failed to load provider 2 (secondary): Error: Failed to load profile",
			)

			consoleErrorSpy.mockRestore()
		})

		describe("underLimit", () => {
			it("should return true if provider has no limits", () => {
				const handler = new VirtualHandler({} as any)
				const providerData = { providerId: "p1" }
				expect(handler.underLimit(providerData as any)).toBe(true)
			})

			it("should return false if requests per minute are exceeded", () => {
				const handler = new VirtualHandler({} as any)
				const providerData = {
					providerId: "p1",
					providerLimits: { requestsPerMinute: 10 },
				}
				const usageTracker = (handler as any).usage
				vitest.spyOn(usageTracker, "getUsage").mockReturnValue({ requests: 10, tokens: 0 })
				expect(handler.underLimit(providerData as any)).toBe(false)
			})

			it("should return false if tokens per day are exceeded", () => {
				const handler = new VirtualHandler({} as any)
				const providerData = {
					providerId: "p1",
					providerLimits: { tokensPerDay: 1000 },
				}
				const usageTracker = (handler as any).usage
				vitest.spyOn(usageTracker, "getUsage").mockReturnValue({ requests: 0, tokens: 1001 })
				expect(handler.underLimit(providerData as any)).toBe(false)
			})
		})

		describe("adjustActiveHandler", () => {
			it("should set first handler as active if it is under limit", async () => {
				const handler = new VirtualHandler({
					providers: [mockPrimaryProvider],
				} as any)
				// Set up the handlers array directly for testing
				;(handler as any).handlers = [
					{ handler: mockPrimaryHandler, providerId: "p1", config: mockPrimaryProvider },
				]
				vitest.spyOn(handler, "underLimit").mockReturnValue(true)

				await handler.adjustActiveHandler()

				expect((handler as any).activeHandler).toBe(mockPrimaryHandler)
				expect((handler as any).activeHandlerId).toBe("p1")
			})

			it("should switch to second handler if first is over limit", async () => {
				const handler = new VirtualHandler({
					providers: [mockPrimaryProvider, mockSecondaryProvider],
				} as any)
				// Set up the handlers array directly for testing
				;(handler as any).handlers = [
					{ handler: mockPrimaryHandler, providerId: "p1", config: mockPrimaryProvider },
					{ handler: mockSecondaryHandler, providerId: "p2", config: mockSecondaryProvider },
				]
				vitest
					.spyOn(handler, "underLimit")
					.mockImplementationOnce(() => false) // First over limit
					.mockImplementationOnce(() => true) // Second under limit

				await handler.adjustActiveHandler()

				expect((handler as any).activeHandler).toBe(mockSecondaryHandler)
				expect((handler as any).activeHandlerId).toBe("p2")
			})

			it("should use first handler as fallback if all are over limit", async () => {
				const handler = new VirtualHandler({
					providers: [mockPrimaryProvider, mockSecondaryProvider, mockBackupProvider],
				} as any)
				// Set up the handlers array directly for testing
				;(handler as any).handlers = [
					{ handler: mockPrimaryHandler, providerId: "p1", config: mockPrimaryProvider },
					{ handler: mockSecondaryHandler, providerId: "p2", config: mockSecondaryProvider },
					{ handler: mockBackupHandler, providerId: "p3", config: mockBackupProvider },
				]
				vitest.spyOn(handler, "underLimit").mockReturnValue(false) // All over limit

				await handler.adjustActiveHandler()

				// Should fallback to first handler when all are over limit
				expect((handler as any).activeHandler).toBe(mockPrimaryHandler)
				expect((handler as any).activeHandlerId).toBe("p1")
			})

			it("should set active handler to undefined if no providers are available", async () => {
				const handler = new VirtualHandler({} as any)
				// Ensure handlers array is empty
				;(handler as any).handlers = []
				await handler.adjustActiveHandler()
				expect((handler as any).activeHandler).toBeUndefined()
				expect((handler as any).activeHandlerId).toBeUndefined()
			})
		})

		describe("createMessage", () => {
			it("should forward the call to the active handler and track usage", async () => {
				const handler = new VirtualHandler({
					providers: [mockPrimaryProvider],
				} as any)

				// Set up a mock active handler
				const mockStream = (async function* () {
					yield { type: "text", text: "response" }
					yield { type: "usage", inputTokens: 10, outputTokens: 20 }
				})()
				const createMessageMock = vitest.fn().mockReturnValue(mockStream)
				const activeHandler = {
					...mockPrimaryHandler,
					createMessage: createMessageMock,
					_profileId: "p1",
				}
				await handler.adjustActiveHandler() // let it run once to set the handler

				const usageTracker = (handler as any).usage
				const consumeSpy = vitest.spyOn(usageTracker, "consume")
				vitest.spyOn(handler, "adjustActiveHandler").mockImplementation(async () => {
					// prevent it from running again and clearing our active handler
					;(handler as any).activeHandler = activeHandler
					;(handler as any).activeHandlerId = "p1"
				})

				const systemPrompt = "system"
				const messages = [{ role: "user", content: "hello" }] as any

				// Consume the stream
				const stream = handler.createMessage(systemPrompt, messages)
				const chunks = []
				for await (const chunk of stream) {
					chunks.push(chunk)
				}

				// Verify forwarding
				expect(createMessageMock).toHaveBeenCalledWith(systemPrompt, messages, undefined)
				expect(chunks).toHaveLength(2)

				// Verify usage tracking
				expect(consumeSpy).toHaveBeenCalledWith("p1", "requests", 1)
				expect(consumeSpy).toHaveBeenCalledWith("p1", "tokens", 30)
			})

			it("should throw an error if no active handler is configured", async () => {
				const handler = new VirtualHandler({} as any)
				;(handler as any).activeHandler = undefined

				const stream = handler.createMessage("system", [])
				await expect(stream.next()).rejects.toThrow("No active handler configured")
			})
		})

		describe("countTokens", () => {
			it("should delegate to the active handler", async () => {
				const handler = new VirtualHandler({} as any)
				const countTokensMock = vitest.fn().mockResolvedValue(123)
				;(handler as any).activeHandler = { countTokens: countTokensMock }

				const content = [{ type: "text", text: "count me" }] as any
				const result = await handler.countTokens(content)

				expect(countTokensMock).toHaveBeenCalledWith(content)
				expect(result).toBe(123)
			})

			it("should return 0 if no active handler", async () => {
				const handler = new VirtualHandler({} as any)
				;(handler as any).activeHandler = undefined
				const result = await handler.countTokens([])
				expect(result).toBe(0)
			})
		})

		describe("getModel", () => {
			it("should delegate to the active handler", () => {
				const handler = new VirtualHandler({} as any)
				const getModelMock = vitest.fn().mockReturnValue({ id: "test-model" })
				;(handler as any).activeHandler = { getModel: getModelMock }

				const result = handler.getModel()

				expect(getModelMock).toHaveBeenCalled()
				expect(result).toEqual({ id: "test-model" })
			})

			it("should throw an error if no active handler", () => {
				const handler = new VirtualHandler({} as any)
				;(handler as any).activeHandler = undefined
				expect(() => handler.getModel()).toThrow("No active handler configured")
			})
		})
	})
})
