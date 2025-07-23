import { Anthropic } from "@anthropic-ai/sdk"
import { z } from "zod"
import type { ModelInfo, ProviderSettings } from "@roo-code/types"
import { ProviderSettingsManager } from "../../core/config/ProviderSettingsManager"
import { ContextProxy } from "../../core/config/ContextProxy"
import { ApiStream } from "../transform/stream"
import type { ExtensionContext, Memento } from "vscode"

import type { ApiHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { buildApiHandler } from "../index"
import { virtualProviderDataSchema } from "../../../packages/types/src/provider-settings"
import { EXPERIMENT_IDS, experiments as Experiments } from "../../shared/experiments"
type VirtualProvider = z.infer<typeof virtualProviderDataSchema>

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
	private usage: UsageTracker

	constructor(options: ProviderSettings) {
		this.settings = options
		this.settingsManager = new ProviderSettingsManager(ContextProxy.instance.rawContext)
		this.loadConfiguredProviders()
		// Get the singleton
		this.usage = UsageTracker.initialize(ContextProxy.instance.rawContext)
	}
	countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		if (!this.activeHandler) {
			return Promise.resolve(0)
		}
		return this.activeHandler.countTokens(content)
	}

	async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		await this.adjustActiveHandler()
		if (!this.activeHandler || !this.activeHandlerId || !this.usage) {
			throw new Error("No active handler configured")
		}

		// Get the provider name for the active handler
		let providerName = "unknown"
		if (this.activeHandlerId) {
			try {
				const profile = await this.settingsManager.getProfile({ id: this.activeHandlerId })
				providerName = profile.name
			} catch (error) {}
		}

		// Track request consumption - one request per createMessage call
		if (this.usage && this.activeHandlerId) {
			try {
				await this.usage.consume(this.activeHandlerId, "requests", 1)
			} catch (error) {
				// console.warn("Failed to track request consumption:", error)
			}
		}

		// Intercept the stream to track token usage
		for await (const chunk of this.activeHandler.createMessage(systemPrompt, messages, metadata)) {
			// Track token consumption when we receive usage information
			if (chunk.type === "usage" && this.usage && this.activeHandlerId) {
				try {
					const totalTokens = (chunk.inputTokens || 0) + (chunk.outputTokens || 0)
					if (totalTokens > 0) {
						await this.usage.consume(this.activeHandlerId, "tokens", totalTokens)
					}
				} catch (error) {
					// console.warn("Failed to track token consumption:", error)
				}
			}
			yield chunk
		}
	}

	getModel(): { id: string; info: ModelInfo } {
		if (!this.activeHandler) {
			throw new Error("No active handler configured")
		}
		const model = this.activeHandler.getModel()
		return model
	}
	/**
	 * Loads and validates the configured provider profiles from settings
	 */
	private async loadConfiguredProviders() {
		// Extract configured providers from settings
		const providers = {
			primary: this.settings.primaryProvider,
			secondary: this.settings.secondaryProvider,
			backup: this.settings.backupProvider,
		}

		// Validate and load each configured provider
		for (const [role, provider] of Object.entries(providers)) {
			if (provider && provider.providerId && provider.providerName) {
				try {
					const profile = await this.settingsManager.getProfile({ id: provider.providerId })

					// Build the actual API handler using the profile
					const apiHandler = buildApiHandler(profile)

					// Assign to the appropriate handler property with ID tracking
					switch (role) {
						case "primary":
							this.primaryHandler = apiHandler
							// Store profile ID for primary handler reference
							if (apiHandler) {
								;(apiHandler as any)._profileId = profile.id
							}
							break
						case "secondary":
							this.secondaryHandler = apiHandler
							// Store profile ID for secondary handler reference
							if (apiHandler) {
								;(apiHandler as any)._profileId = profile.id
							}
							break
						case "backup":
							this.backupHandler = apiHandler
							// Store profile ID for backup handler reference
							if (apiHandler) {
								;(apiHandler as any)._profileId = profile.id
							}
							break
					}
				} catch (error) {
					console.error(`  ❌ Failed to load ${role} provider ${provider.providerName}: ${error}`)
				}
			}
		}
		this.adjustActiveHandler()
	}

	/**
	 * Adjusts which handler is currently the active handler by selecting the first one under limits.
	 */
	async adjustActiveHandler(): Promise<void> {
		const availableHandlers = [this.primaryHandler, this.secondaryHandler, this.backupHandler].filter(
			(handler): handler is ApiHandler => handler !== undefined,
		)
		console.log(availableHandlers)

		if (availableHandlers.length === 0) {
			this.activeHandler = undefined
			this.activeHandlerId = undefined
			return
		}

		// Check the primary first, always.
		if (this.settings.primaryProvider) {
			if (this.underLimit(this.settings.primaryProvider)) {
				this.activeHandler = this.primaryHandler
				this.activeHandlerId = (this.primaryHandler as any)?._profileId
				return
			}
		}
		//then the secondary
		if (this.settings.secondaryProvider) {
			if (this.underLimit(this.settings.secondaryProvider)) {
				this.activeHandler = this.secondaryHandler
				this.activeHandlerId = (this.secondaryHandler as any)?._profileId
				return
			}
		}
		this.activeHandler = this.backupHandler
		this.activeHandlerId = (this.backupHandler as any)?._profileId
	}

	underLimit(providerData: VirtualProvider): boolean {
		const { providerId, providerLimits: limits } = providerData
		if (!providerId) {
			return false
		} //what does that even?
		if (!limits) {
			return true
		} //The provider exists, but has no limits set, so we should use it always.
		// Thats a weird config, but send it!
		if (limits.requestsPerMinute || limits.tokensPerMinute) {
			const minuteUsage = this.usage.getUsage(providerId, "minute")
			console.log(`Minute usage for ${providerId}:`, minuteUsage)
			if (limits.requestsPerMinute && minuteUsage.requests >= limits.requestsPerMinute) {
				console.log(
					`RATE LIMIT: Requests per minute exceeded for ${providerId}. Usage: ${minuteUsage.requests}, Limit: ${limits.requestsPerMinute}`,
				)
				return false
			}
			if (limits.tokensPerMinute && minuteUsage.tokens >= limits.tokensPerMinute) {
				console.log(
					`RATE LIMIT: Tokens per minute exceeded for ${providerId}. Usage: ${minuteUsage.tokens}, Limit: ${limits.tokensPerMinute}`,
				)
				return false
			}
		}
		if (limits.requestsPerHour || limits.tokensPerHour) {
			const hourUsage = this.usage.getUsage(providerId, "hour")
			console.log(`Hour usage for ${providerId}:`, hourUsage)
			if (limits.requestsPerHour && hourUsage.requests >= limits.requestsPerHour) {
				console.log(
					`RATE LIMIT: Requests per hour exceeded for ${providerId}. Usage: ${hourUsage.requests}, Limit: ${limits.requestsPerHour}`,
				)
				return false
			}
			if (limits.tokensPerHour && hourUsage.tokens >= limits.tokensPerHour) {
				console.log(
					`RATE LIMIT: Tokens per hour exceeded for ${providerId}. Usage: ${hourUsage.tokens}, Limit: ${limits.tokensPerHour}`,
				)
				return false
			}
		}
		if (limits.requestsPerDay || limits.tokensPerDay) {
			const dayUsage = this.usage.getUsage(providerId, "day")
			console.log(`Day usage for ${providerId}:`, dayUsage)
			if (limits.requestsPerDay && dayUsage.requests >= limits.requestsPerDay) {
				console.log(
					`RATE LIMIT: Requests per day exceeded for ${providerId}. Usage: ${dayUsage.requests}, Limit: ${limits.requestsPerDay}`,
				)
				return false
			}
			if (limits.tokensPerDay && dayUsage.tokens >= limits.tokensPerDay) {
				console.log(
					`RATE LIMIT: Tokens per day exceeded for ${providerId}. Usage: ${dayUsage.tokens}, Limit: ${limits.tokensPerDay}`,
				)
				return false
			}
		}
		console.log(`Provider ${providerId} is ready for request.`)
		return true
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
		this.memento = context.globalState
	}

	/**
	 * Initializes the singleton instance of the UsageTracker.
	 * @param context The extension context provided by VS Code.
	 */
	public static initialize(context: ExtensionContext): UsageTracker {
		if (!UsageTracker._instance) {
			UsageTracker._instance = new UsageTracker(context)
		}
		return UsageTracker._instance
	}
	public static getInstance(): UsageTracker {
		if (!UsageTracker._instance) {
			UsageTracker.initialize(ContextProxy.instance.rawContext)
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
		const newEvent: UsageEvent = {
			timestamp: Date.now(),
			providerId,
			type,
			count,
		}

		const allEvents = this.getPrunedEvents()
		allEvents.push(newEvent)

		await this.memento.update(USAGE_STORAGE_KEY, allEvents)
	}
	/**
	 * Calculates the total usage for a given provider over a specified sliding window.
	 *
	 * @param providerId The provider to retrieve usage for.
	 * @param window The time window to calculate usage within ('minute', 'hour', 'day').
	 * @returns An object containing the total number of tokens and requests.
	 */
	public getUsage(providerId: string, window: UsageWindow): UsageResult {
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

		const allEvents = this.memento.get<UsageEvent[]>(USAGE_STORAGE_KEY, [])

		const relevantEvents = allEvents.filter(
			(event) => event.providerId === providerId && event.timestamp >= startTime,
		)

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

		return result
	}

	/**
	 * Retrieves all events from storage and filters out any that are older
	 * than the longest tracking window (1 day). This prevents the storage
	 * from growing indefinitely.
	 */
	private getPrunedEvents(): UsageEvent[] {
		const allEvents = this.memento.get<UsageEvent[]>(USAGE_STORAGE_KEY, [])
		const cutoff = Date.now() - ONE_DAY_MS
		const prunedEvents = allEvents.filter((event) => event.timestamp >= cutoff)
		return prunedEvents
	}

	/**
	 * A utility method to completely clear all tracked usage data.
	 */
	public async clearAllUsageData(): Promise<void> {
		await this.memento.update(USAGE_STORAGE_KEY, undefined)
	}
}
