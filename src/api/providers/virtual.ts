import { Anthropic } from "@anthropic-ai/sdk"

import type { ModelInfo, ProviderSettings } from "@roo-code/types"
import { ProviderSettingsManager } from "../../core/config/ProviderSettingsManager"
import { ContextProxy } from "../../core/config/ContextProxy"
import { ApiStream } from "../transform/stream"

import type { ApiHandler } from "../index"

/**
 * Virtual API processor.
 * This handler is designed to call other API handlers.
 */
export class VirtualHandler implements ApiHandler {
	private settingsManager: ProviderSettingsManager
	private settings: ProviderSettings
	constructor(options: ProviderSettings) {
		this.settings = options
		this.settingsManager = new ProviderSettingsManager(ContextProxy.instance.rawContext)
		this.loadConfiguredProviders()
	}
	countTokens(_content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		return Promise.resolve(0)
	}

	async *createMessage(_systemPrompt: string, _messages: Anthropic.Messages.MessageParam[]): ApiStream {
		yield { type: "text", text: "This is a response from the VirtualHandler." }
	}

	getModel(): { id: string; info: ModelInfo } {
		return {
			id: "virtual",
			info: {
				maxTokens: 16384,
				contextWindow: 100000,
				supportsImages: false,
				supportsPromptCache: false,
				supportsComputerUse: false,
				inputPrice: 0,
				outputPrice: 0,
				description: "A virtual handler that calls other handlers.",
			},
		}
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

		console.log("Configured providers:", providers)

		// Validate and load each configured provider
		for (const [role, provider] of Object.entries(providers)) {
			if (provider && provider.providerId && provider.providerName) {
				try {
					const profile = await this.settingsManager.getProfile({ id: provider.providerId })
					console.log(
						`  ✅ Successfully loaded ${role} provider: ${profile.name} (${profile.apiProvider || "default"})`,
					)
				} catch (error) {
					console.log(`  ❌ Failed to load ${role} provider ${provider.providerName}: ${error}`)
				}
			} else {
				console.log(`  ⚠️  No ${role} provider configured`)
			}
		}
	}
}
