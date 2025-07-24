import { Anthropic } from "@anthropic-ai/sdk"
import { z } from "zod"
import type { ModelInfo, ProviderSettings } from "@roo-code/types"
import { ProviderSettingsManager } from "../../core/config/ProviderSettingsManager"
import { ContextProxy } from "../../core/config/ContextProxy"
import { ApiStream } from "../transform/stream"

import type { ApiHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { buildApiHandler } from "../index"
import { virtualQuotaFallbackProviderDataSchema } from "../../../packages/types/src/provider-settings"
import { UsageTracker } from "../../utils/usage-tracker"

type VirtualQuotaFallbackProvider = z.infer<typeof virtualQuotaFallbackProviderDataSchema>

/**
 * Virtual Quota Fallback Provider API processor.
 * This handler is designed to call other API handlers with automatic fallback when quota limits are reached.
 */
export class VirtualHandler implements ApiHandler {
	private settingsManager: ProviderSettingsManager
	private settings: ProviderSettings

	private handlers: Array<{ handler: ApiHandler; providerId: string; config: VirtualQuotaFallbackProvider }> = []
	private activeHandler: ApiHandler | undefined
	private activeHandlerId: string | undefined
	private usage: UsageTracker

	constructor(options: ProviderSettings) {
		this.settings = options
		this.settingsManager = new ProviderSettingsManager(ContextProxy.instance.rawContext)
		this.loadConfiguredProviders()
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
		this.handlers = []

		// Get providers array - support both new format and legacy format
		const providers = this.getProvidersArray()

		// Validate and load each configured provider
		for (let i = 0; i < providers.length; i++) {
			const provider = providers[i]
			if (provider && provider.providerId && provider.providerName) {
				try {
					const profile = await this.settingsManager.getProfile({ id: provider.providerId })

					// Build the actual API handler using the profile
					const apiHandler = buildApiHandler(profile)

					if (apiHandler) {
						this.handlers.push({
							handler: apiHandler,
							providerId: provider.providerId,
							config: provider,
						})
					}
				} catch (error) {
					console.error(`  ❌ Failed to load provider ${i + 1} (${provider.providerName}): ${error}`)
				}
			}
		}
		this.adjustActiveHandler()
	}

	/**
	 * Gets the providers array
	 */
	private getProvidersArray(): VirtualQuotaFallbackProvider[] {
		return this.settings.providers || []
	}

	/**
	 * Adjusts which handler is currently the active handler by selecting the first one under limits.
	 */
	async adjustActiveHandler(): Promise<void> {
		if (this.handlers.length === 0) {
			this.activeHandler = undefined
			this.activeHandlerId = undefined
			return
		}

		// Check handlers in order, selecting the first one under limits
		for (const { handler, providerId, config } of this.handlers) {
			if (this.underLimit(config)) {
				this.activeHandler = handler
				this.activeHandlerId = providerId
				return
			}
		}

		// If all handlers are over limits, use the first one as fallback
		const firstHandler = this.handlers[0]
		this.activeHandler = firstHandler.handler
		this.activeHandlerId = firstHandler.providerId
	}

	underLimit(providerData: VirtualQuotaFallbackProvider): boolean {
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
			if (limits.requestsPerMinute && minuteUsage.requests >= limits.requestsPerMinute) {
				return false
			}
			if (limits.tokensPerMinute && minuteUsage.tokens >= limits.tokensPerMinute) {
				return false
			}
		}
		if (limits.requestsPerHour || limits.tokensPerHour) {
			const hourUsage = this.usage.getUsage(providerId, "hour")
			if (limits.requestsPerHour && hourUsage.requests >= limits.requestsPerHour) {
				return false
			}
			if (limits.tokensPerHour && hourUsage.tokens >= limits.tokensPerHour) {
				return false
			}
		}
		if (limits.requestsPerDay || limits.tokensPerDay) {
			const dayUsage = this.usage.getUsage(providerId, "day")
			if (limits.requestsPerDay && dayUsage.requests >= limits.requestsPerDay) {
				return false
			}
			if (limits.tokensPerDay && dayUsage.tokens >= limits.tokensPerDay) {
				return false
			}
		}
		return true
	}
}
