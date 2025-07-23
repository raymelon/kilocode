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
	private usage: UsageTracker | undefined

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
		if (!this.activeHandler) {
			throw new Error("No active handler configured")
		}
		yield* this.activeHandler.createMessage(systemPrompt, messages, metadata)
	}

	getModel(): { id: string; info: ModelInfo } {
		if (!this.activeHandler) {
			throw new Error("No active handler configured")
		}
		return this.activeHandler.getModel()
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

		// Validate and load each configured provider
		for (const [role, provider] of Object.entries(providers)) {
			if (provider && provider.providerId && provider.providerName) {
				try {
					const profile = await this.settingsManager.getProfile({ id: provider.providerId })

					// Build the actual API handler using the profile
					const apiHandler = buildApiHandler(profile)

					// Assign to the appropriate handler property
					switch (role) {
						case "primary":
							this.primaryHandler = apiHandler
							break
						case "secondary":
							this.secondaryHandler = apiHandler
							break
						case "backup":
							this.backupHandler = apiHandler
							break
					}
				} catch (error) {
					console.error(`  ❌ Failed to load ${role} provider ${provider.providerName}: ${error}`)
				}
			} else {
				console.warn(`  ⚠️  No ${role} provider configured`)
			}
		}
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
		return allEvents.filter((event) => event.timestamp >= cutoff)
	}

	/**
	 * A utility method to completely clear all tracked usage data.
	 */
	public async clearAllUsageData(): Promise<void> {
		await this.memento.update(USAGE_STORAGE_KEY, undefined)
	}
}
