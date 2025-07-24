// kilocode_change - new file
import { Anthropic } from "@anthropic-ai/sdk"
import { z } from "zod"
import type { ModelInfo, ProviderSettings } from "@roo-code/types"
import { ProviderSettingsManager } from "../../core/config/ProviderSettingsManager"
import { ContextProxy } from "../../core/config/ContextProxy"
import { ApiStream } from "../transform/stream"

import type { ApiHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { buildApiHandler } from "../index"
import { virtualQuotaFallbackProviderDataSchema } from "../../../packages/types/src/provider-settings"
import { UsageTracker, type UsageWindow } from "../../utils/usage-tracker"

type VirtualQuotaFallbackProvider = z.infer<typeof virtualQuotaFallbackProviderDataSchema>

interface HandlerConfig {
	handler: ApiHandler
	providerId: string
	config: VirtualQuotaFallbackProvider
}

/**
 * Virtual Quota Fallback Provider API processor.
 * This handler is designed to call other API handlers with automatic fallback when quota limits are reached.
 */
export class VirtualHandler implements ApiHandler {
	private settingsManager: ProviderSettingsManager
	private settings: ProviderSettings

	private handlers: HandlerConfig[] = []
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
			} catch (error) {
				console.warn(`Failed to get provider name for ${this.activeHandlerId}:`, error)
			}
		}

		// Track request consumption - one request per createMessage call
		if (this.usage && this.activeHandlerId) {
			try {
				await this.usage.consume(this.activeHandlerId, "requests", 1)
			} catch (error) {
				console.warn("Failed to track request consumption:", error)
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
					console.warn("Failed to track token consumption:", error)
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
	private async loadConfiguredProviders(): Promise<void> {
		this.handlers = []

		const providers = this.settings.providers || []

		// Load all providers in parallel for better performance
		const handlerPromises = providers.map(async (provider, index) => {
			if (!provider?.providerId || !provider?.providerName) {
				return null
			}

			try {
				const profile = await this.settingsManager.getProfile({ id: provider.providerId })
				const apiHandler = buildApiHandler(profile)

				if (apiHandler) {
					return {
						handler: apiHandler,
						providerId: provider.providerId,
						config: provider,
					} as HandlerConfig
				}
			} catch (error) {
				console.error(`❌ Failed to load provider ${index + 1} (${provider.providerName}): ${error}`)
			}
			return null
		})

		const results = await Promise.all(handlerPromises)
		this.handlers = results.filter((handler): handler is HandlerConfig => handler !== null)

		await this.adjustActiveHandler()
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

	/**
	 * Checks if a provider is under its configured limits
	 */
	underLimit(providerData: VirtualQuotaFallbackProvider): boolean {
		const { providerId, providerLimits: limits } = providerData

		if (!providerId) {
			return false
		}

		if (!limits) {
			// Provider exists but has no limits set, so it can always be used
			return true
		}

		// Check limits for each time window
		const timeWindows: Array<{ window: UsageWindow; requests?: number; tokens?: number }> = [
			{ window: "minute", requests: limits.requestsPerMinute, tokens: limits.tokensPerMinute },
			{ window: "hour", requests: limits.requestsPerHour, tokens: limits.tokensPerHour },
			{ window: "day", requests: limits.requestsPerDay, tokens: limits.tokensPerDay },
		]

		for (const { window, requests: requestLimit, tokens: tokenLimit } of timeWindows) {
			if (requestLimit || tokenLimit) {
				const usage = this.usage.getUsage(providerId, window)

				if (requestLimit && usage.requests >= requestLimit) {
					return false
				}

				if (tokenLimit && usage.tokens >= tokenLimit) {
					return false
				}
			}
		}

		return true
	}
}
