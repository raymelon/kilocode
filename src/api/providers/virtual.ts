import { Anthropic } from "@anthropic-ai/sdk"

import type { ModelInfo, ProviderSettings } from "@roo-code/types"
import { ProviderSettingsManager } from "../../core/config/ProviderSettingsManager"
import { ContextProxy } from "../../core/config/ContextProxy"
import { ApiStream } from "../transform/stream"
import type { ExtensionContext, Memento } from "vscode"

import type { ApiHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { buildApiHandler } from "../index"

/**
 * Virtual API processor.
 * This handler is designed to call other API handlers.
 */
export class VirtualHandler implements ApiHandler {
	private settingsManager: ProviderSettingsManager
	private settings: ProviderSettings

	private primaryHandler: ApiHandler | undefined
	private secondaryHandler: ApiHandler | undefined
	private backupHandler: ApiHandler | undefined
	private activeHandler: ApiHandler | undefined
	private activeHandlerId: string | undefined
	private usage: UsageTracker | undefined

	constructor(options: ProviderSettings) {
		console.log("VirtualHandler constructor called with options:", options)
		this.settings = options
		console.log("VirtualHandler settings initialized:", this.settings)
		this.settingsManager = new ProviderSettingsManager(ContextProxy.instance.rawContext)
		console.log("VirtualHandler settingsManager created")
		this.loadConfiguredProviders()
		// Get the singleton
		this.usage = UsageTracker.initialize(ContextProxy.instance.rawContext)
		console.log("VirtualHandler usage tracker initialized:", this.usage)
	}
	countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		console.log("VirtualHandler.countTokens called, activeHandler:", this.activeHandler ? "present" : "missing")
		if (!this.activeHandler) {
			console.log("VirtualHandler.countTokens returning 0 - no active handler")
			return Promise.resolve(0)
		}
		console.log("VirtualHandler.countTokens delegating to activeHandler")
		return this.activeHandler.countTokens(content)
	}

	async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		console.log("VirtualHandler.createMessage called, messages count:", messages.length)
		console.log("Calling adjustActiveHandler to select active handler...")
		this.adjustActiveHandler()
		console.log("VirtualHandler.createMessage activeHandler:", this.activeHandler ? "present" : "missing")
		if (!this.activeHandler) {
			console.error("VirtualHandler.createMessage - No active handler configured")
			throw new Error("No active handler configured")
		}

		// Get the provider name for the active handler
		let providerName = "unknown"
		if (this.activeHandlerId) {
			try {
				const profile = await this.settingsManager.getProfile({ id: this.activeHandlerId })
				providerName = profile.name
			} catch (error) {
				console.warn("Could not get profile for activeHandlerId:", this.activeHandlerId, error)
			}
		}

		// Track request consumption - one request per createMessage call
		if (this.usage && this.activeHandlerId) {
			try {
				await this.usage.consume(this.activeHandlerId, "requests", 1)
				console.log("Request consumption tracked for provider:", this.activeHandlerId)
			} catch (error) {
				console.warn("Failed to track request consumption:", error)
			}
		}

		console.log("VirtualHandler.createMessage delegating to activeHandler with provider:", providerName)

		// Intercept the stream to track token usage
		for await (const chunk of this.activeHandler.createMessage(systemPrompt, messages, metadata)) {
			// Track token consumption when we receive usage information
			if (chunk.type === "usage" && this.usage && this.activeHandlerId) {
				try {
					const totalTokens = (chunk.inputTokens || 0) + (chunk.outputTokens || 0)
					if (totalTokens > 0) {
						await this.usage.consume(this.activeHandlerId, "tokens", totalTokens)
						console.log(
							"Token consumption tracked:",
							totalTokens,
							"tokens for provider:",
							this.activeHandlerId,
						)
					}
				} catch (error) {
					console.warn("Failed to track token consumption:", error)
				}
			}
			yield chunk
		}
	}

	getModel(): { id: string; info: ModelInfo } {
		console.log("VirtualHandler.getModel called, activeHandler:", this.activeHandler ? "present" : "missing")
		if (!this.activeHandler) {
			console.error("VirtualHandler.getModel - No active handler configured")
			throw new Error("No active handler configured")
		}
		const model = this.activeHandler.getModel()
		console.log("VirtualHandler.getModel returning model:", model)
		return model
	}
	/**
	 * Loads and validates the configured provider profiles from settings
	 */
	private async loadConfiguredProviders() {
		console.log("Loading configured providers from settings...")

		// Extract configured providers from settings
		const providers = {
			primary: this.settings.primaryProvider,
			secondary: this.settings.secondaryProvider,
			backup: this.settings.backupProvider,
		}
		console.log("Extracted providers from settings:", providers)

		// Validate and load each configured provider
		for (const [role, provider] of Object.entries(providers)) {
			console.log(`Processing ${role} provider:`, provider)
			if (provider && provider.providerId && provider.providerName) {
				try {
					console.log(`Loading profile for ${role} provider ID: ${provider.providerId}`)
					const profile = await this.settingsManager.getProfile({ id: provider.providerId })
					console.log(`Profile loaded for ${role}:`, profile.name, "with provider type:", profile.apiProvider)

					// Build the actual API handler using the profile
					const apiHandler = buildApiHandler(profile)
					console.log(`API handler built for ${role}:`, apiHandler ? "success" : "failed")

					// Assign to the appropriate handler property with ID tracking
					switch (role) {
						case "primary":
							this.primaryHandler = apiHandler
							// Store profile ID for primary handler reference
							if (apiHandler) {
								;(apiHandler as any)._profileId = profile.id
							}
							console.log("Primary handler assigned for provider:", profile.name, "with ID:", profile.id)
							break
						case "secondary":
							this.secondaryHandler = apiHandler
							// Store profile ID for secondary handler reference
							if (apiHandler) {
								;(apiHandler as any)._profileId = profile.id
							}
							console.log(
								"Secondary handler assigned for provider:",
								profile.name,
								"with ID:",
								profile.id,
							)
							break
						case "backup":
							this.backupHandler = apiHandler
							// Store profile ID for backup handler reference
							if (apiHandler) {
								;(apiHandler as any)._profileId = profile.id
							}
							console.log("Backup handler assigned for provider:", profile.name, "with ID:", profile.id)
							break
					}
				} catch (error) {
					console.error(`  ❌ Failed to load ${role} provider ${provider.providerName}: ${error}`)
				}
			} else {
				console.warn(`  ⚠️  No ${role} provider configured`)
			}
		}
		console.log(
			"Final handler state - Primary:",
			this.primaryHandler ? "set" : "unset",
			"Secondary:",
			this.secondaryHandler ? "set" : "unset",
			"Backup:",
			this.backupHandler ? "set" : "unset",
		)
		console.log("Calling adjustActiveHandler to select active handler...")
		this.adjustActiveHandler()
	}

	/**
	 * Adjusts which handler is currently the active handler by randomly selecting
	 * from primary, secondary, or backup handlers.
	 */
	adjustActiveHandler(): void {
		console.log("VirtualHandler.adjustActiveHandler called")
		const availableHandlers = [this.primaryHandler, this.secondaryHandler, this.backupHandler].filter(
			(handler): handler is ApiHandler => handler !== undefined,
		)
		console.log("Available handlers count:", availableHandlers.length)

		if (availableHandlers.length === 0) {
			console.log("No available handlers - setting activeHandler to undefined")
			this.activeHandler = undefined
			return
		}

		const randomIndex = Math.floor(Math.random() * availableHandlers.length)
		console.log("Selected random index:", randomIndex)
		this.activeHandler = availableHandlers[randomIndex]
		this.activeHandlerId = (this.activeHandler as any)?._profileId
		console.log(
			"Active handler set to index",
			randomIndex,
			"of",
			availableHandlers.length,
			"available handlers, profile ID:",
			this.activeHandlerId,
		)
	}
}

export type UsageType = "tokens" | "requests"
export type UsageWindow = "minute" | "hour" | "day"
interface UsageEvent {
	/** The timestamp of the event in milliseconds since epoch. */
	timestamp: number
	/** The identifier for the AI provider (e.g., 'ds8f93js'). */
	providerId: string
	/** The type of usage. */
	type: UsageType
	/** The amount consumed (e.g., number of tokens or 1 for a single request). */
	count: number
}
interface UsageResult {
	tokens: number
	requests: number
}
const USAGE_STORAGE_KEY = "kilocode.virtualprovider.usage.v1"
const ONE_MINUTE_MS = 60 * 1000
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
const ONE_DAY_MS = 24 * ONE_HOUR_MS

export class UsageTracker {
	private static _instance: UsageTracker
	private memento: Memento

	// Private constructor to enforce singleton pattern
	private constructor(context: ExtensionContext) {
		console.log("UsageTracker constructor called")
		this.memento = context.globalState
		console.log("UsageTracker memento initialized")
	}

	/**
	 * Initializes the singleton instance of the UsageTracker.
	 * @param context The extension context provided by VS Code.
	 */
	public static initialize(context: ExtensionContext): UsageTracker {
		console.log("UsageTracker.initialize called")
		if (!UsageTracker._instance) {
			console.log("Creating new UsageTracker instance")
			UsageTracker._instance = new UsageTracker(context)
		} else {
			console.log("Returning existing UsageTracker instance")
		}
		return UsageTracker._instance
	}
	/**
	 * Records a usage event.
	 * This data is added to a list in the global state. Old data is automatically pruned.
	 *
	 * @param providerId The unique identifier of the AI provider.
	 * @param type The type of usage, either "tokens" or "requests".
	 * @param count The number of tokens or requests to record.
	 */
	public async consume(providerId: string, type: UsageType, count: number): Promise<void> {
		console.log("UsageTracker.consume called - providerId:", providerId, "type:", type, "count:", count)
		const newEvent: UsageEvent = {
			timestamp: Date.now(),
			providerId,
			type,
			count,
		}
		console.log("New usage event created:", newEvent)

		const allEvents = this.getPrunedEvents()
		console.log("Current events count before adding new event:", allEvents.length)
		allEvents.push(newEvent)
		console.log("Events count after adding new event:", allEvents.length)

		await this.memento.update(USAGE_STORAGE_KEY, allEvents)
		console.log("UsageTracker.consume completed - events saved to storage")
	}
	/**
	 * Calculates the total usage for a given provider over a specified sliding window.
	 *
	 * @param providerId The provider to retrieve usage for.
	 * @param window The time window to calculate usage within ('minute', 'hour', 'day').
	 * @returns An object containing the total number of tokens and requests.
	 */
	public getUsage(providerId: string, window: UsageWindow): UsageResult {
		console.log("UsageTracker.getUsage called - providerId:", providerId, "window:", window)
		const now = Date.now()
		let startTime: number

		switch (window) {
			case "minute":
				startTime = now - ONE_MINUTE_MS
				break
			case "hour":
				startTime = now - ONE_HOUR_MS
				break
			case "day":
				startTime = now - ONE_DAY_MS
				break
		}
		console.log("Usage calculation time window - now:", now, "startTime:", startTime)

		const allEvents = this.memento.get<UsageEvent[]>(USAGE_STORAGE_KEY, [])
		console.log("Total events in storage:", allEvents.length)

		const relevantEvents = allEvents.filter(
			(event) => event.providerId === providerId && event.timestamp >= startTime,
		)
		console.log("Relevant events for calculation:", relevantEvents.length)

		const result = relevantEvents.reduce<UsageResult>(
			(acc, event) => {
				if (event.type === "tokens") {
					acc.tokens += event.count
				} else if (event.type === "requests") {
					acc.requests += event.count
				}
				return acc
			},
			{ tokens: 0, requests: 0 },
		)
		console.log("Usage calculation result:", result)

		return result
	}

	/**
	 * Retrieves all events from storage and filters out any that are older
	 * than the longest tracking window (1 day). This prevents the storage
	 * from growing indefinitely.
	 */
	private getPrunedEvents(): UsageEvent[] {
		console.log("UsageTracker.getPrunedEvents called")
		const allEvents = this.memento.get<UsageEvent[]>(USAGE_STORAGE_KEY, [])
		console.log("Total events before pruning:", allEvents.length)
		const cutoff = Date.now() - ONE_DAY_MS
		console.log("Pruning cutoff timestamp:", cutoff)
		const prunedEvents = allEvents.filter((event) => event.timestamp >= cutoff)
		console.log("Events after pruning:", prunedEvents.length)
		return prunedEvents
	}

	/**
	 * A utility method to completely clear all tracked usage data.
	 */
	public async clearAllUsageData(): Promise<void> {
		console.log("UsageTracker.clearAllUsageData called")
		await this.memento.update(USAGE_STORAGE_KEY, undefined)
		console.log("All usage data cleared from storage")
	}
}
