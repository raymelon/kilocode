import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"
import { Virtual } from "../../../webview-ui/src/components/settings/providers/Virtual"
import type { ProviderSettings, ProviderSettingsEntry } from "../../../packages/types/src/provider-settings"
import { withExtensionState } from "../src/decorators/withExtensionState"

const meta = {
	title: "Settings/Providers/Virtual Quota Fallback",
	component: Virtual,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"Virtual Quota Fallback Provider settings component that allows configuring multiple providers with quota limits and automatic fallback.",
			},
		},
		extensionState: {
			listApiConfigMeta: [
				{
					id: "anthropic-1",
					name: "Anthropic Claude",
					apiProvider: "anthropic" as const,
				},
				{
					id: "openai-1",
					name: "OpenAI GPT-4",
					apiProvider: "openai" as const,
				},
				{
					id: "gemini-1",
					name: "Google Gemini",
					apiProvider: "gemini" as const,
				},
				{
					id: "virtual-1",
					name: "Virtual Quota Fallback Provider",
					apiProvider: "virtual" as const,
				},
				{
					id: "current-profile",
					name: "Current Profile",
					apiProvider: "openrouter" as const,
				},
			] as ProviderSettingsEntry[],
			currentApiConfigName: "Current Profile",
		},
	},
	tags: ["autodocs"],
	argTypes: {
		apiConfiguration: {
			description: "Provider configuration object containing virtual provider settings",
			control: { type: "object" },
		},
		setApiConfigurationField: {
			description: "Function to update provider configuration fields",
			action: "setApiConfigurationField",
		},
	},
	args: {
		setApiConfigurationField: fn(),
	},
	decorators: [withExtensionState],
} satisfies Meta<typeof Virtual>

export default meta
type Story = StoryObj<typeof meta>

// Default story with no providers configured
export const Default: Story = {
	args: {
		apiConfiguration: {
			apiProvider: "virtual",
			providers: [],
		} as ProviderSettings,
	},
}

// Story with a single provider configured
export const SingleProvider: Story = {
	args: {
		apiConfiguration: {
			apiProvider: "virtual",
			providers: [
				{
					providerId: "anthropic-1",
					providerName: "Anthropic Claude",
					providerLimits: {
						tokensPerMinute: 1000,
						tokensPerHour: 50000,
						tokensPerDay: 1000000,
						requestsPerMinute: 10,
						requestsPerHour: 500,
						requestsPerDay: 5000,
					},
				},
			],
		} as ProviderSettings,
	},
	parameters: {
		docs: {
			description: {
				story: "Shows the virtual quota fallback provider configuration with a single Anthropic provider configured with comprehensive quota limits.",
			},
		},
	},
}

// Story with multiple providers showing different limit configurations
export const MultipleProviders: Story = {
	args: {
		apiConfiguration: {
			apiProvider: "virtual",
			providers: [
				{
					providerId: "anthropic-1",
					providerName: "Anthropic Claude",
					providerLimits: {
						tokensPerMinute: 1000,
						tokensPerHour: 50000,
						tokensPerDay: 1000000,
						requestsPerMinute: 10,
						requestsPerHour: 500,
						requestsPerDay: 5000,
					},
				},
				{
					providerId: "openai-1",
					providerName: "OpenAI GPT-4",
					providerLimits: {
						tokensPerMinute: 2000,
						tokensPerHour: 100000,
						requestsPerMinute: 20,
						requestsPerHour: 1000,
					},
				},
				{
					providerId: "gemini-1",
					providerName: "Google Gemini",
					providerLimits: {
						tokensPerDay: 500000,
						requestsPerDay: 2000,
					},
				},
			],
		} as ProviderSettings,
	},
	parameters: {
		docs: {
			description: {
				story: "Demonstrates a complete virtual quota fallback provider setup with three different providers, each with different quota limiting strategies. The first provider (Anthropic) has comprehensive limits, the second (OpenAI) focuses on minute/hour limits, and the third (Gemini) only has daily limits.",
			},
		},
	},
}

// Story with providers that have partial configurations
export const PartiallyConfigured: Story = {
	args: {
		apiConfiguration: {
			apiProvider: "virtual",
			providers: [
				{
					providerId: "anthropic-1",
					providerName: "Anthropic Claude",
					providerLimits: {
						tokensPerMinute: 1000,
						requestsPerMinute: 10,
					},
				},
				{
					providerId: "openai-1",
					providerName: "OpenAI GPT-4",
					// No limits configured yet
				},
				{
					// Empty provider slot
				},
			],
		} as ProviderSettings,
	},
	parameters: {
		docs: {
			description: {
				story: "Shows the component with partially configured providers - some with limits, some without, and an empty provider slot. This demonstrates the typical state during configuration.",
			},
		},
	},
}

// Story showing conservative rate limits for free tier usage
export const ConservativeLimits: Story = {
	args: {
		apiConfiguration: {
			apiProvider: "virtual",
			providers: [
				{
					providerId: "anthropic-1",
					providerName: "Anthropic Claude",
					providerLimits: {
						tokensPerMinute: 100,
						tokensPerHour: 5000,
						tokensPerDay: 50000,
						requestsPerMinute: 2,
						requestsPerHour: 50,
						requestsPerDay: 500,
					},
				},
				{
					providerId: "openai-1",
					providerName: "OpenAI GPT-4",
					providerLimits: {
						tokensPerMinute: 150,
						tokensPerHour: 7500,
						tokensPerDay: 75000,
						requestsPerMinute: 3,
						requestsPerHour: 75,
						requestsPerDay: 750,
					},
				},
			],
		} as ProviderSettings,
	},
	parameters: {
		docs: {
			description: {
				story: "Example configuration with conservative rate limits suitable for free tier or limited API usage. Shows how to set up failover between providers with modest limits.",
			},
		},
	},
}

// Story showing aggressive rate limits for high-volume usage
export const HighVolumeLimits: Story = {
	args: {
		apiConfiguration: {
			apiProvider: "virtual",
			providers: [
				{
					providerId: "anthropic-1",
					providerName: "Anthropic Claude",
					providerLimits: {
						tokensPerMinute: 10000,
						tokensPerHour: 500000,
						tokensPerDay: 10000000,
						requestsPerMinute: 100,
						requestsPerHour: 5000,
						requestsPerDay: 50000,
					},
				},
				{
					providerId: "openai-1",
					providerName: "OpenAI GPT-4",
					providerLimits: {
						tokensPerMinute: 15000,
						tokensPerHour: 750000,
						tokensPerDay: 15000000,
						requestsPerMinute: 150,
						requestsPerHour: 7500,
						requestsPerDay: 75000,
					},
				},
				{
					providerId: "gemini-1",
					providerName: "Google Gemini",
					providerLimits: {
						tokensPerMinute: 20000,
						tokensPerHour: 1000000,
						tokensPerDay: 20000000,
						requestsPerMinute: 200,
						requestsPerHour: 10000,
						requestsPerDay: 100000,
					},
				},
			],
		} as ProviderSettings,
	},
	parameters: {
		docs: {
			description: {
				story: "Configuration example for high-volume usage with aggressive rate limits. Suitable for enterprise or heavy development usage with premium API tiers.",
			},
		},
	},
}

// Story with no available providers (edge case)
export const NoAvailableProviders: Story = {
	args: {
		apiConfiguration: {
			apiProvider: "virtual",
			providers: [],
		} as ProviderSettings,
	},
	parameters: {
		docs: {
			description: {
				story: "Edge case showing the component when no non-virtual quota fallback provider profiles are available for configuration. Displays the appropriate message to guide users.",
			},
		},
		extensionState: {
			listApiConfigMeta: [
				{
					id: "virtual-1",
					name: "Virtual Quota Fallback Provider",
					apiProvider: "virtual" as const,
				},
				{
					id: "current-profile",
					name: "Current Profile",
					apiProvider: "openrouter" as const,
				},
			] as ProviderSettingsEntry[],
			currentApiConfigName: "Current Profile",
		},
	},
}
