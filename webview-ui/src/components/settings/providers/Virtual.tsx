import { useCallback, useMemo, useState } from "react"
import { Trans } from "react-i18next"
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { PlusIcon, TrashIcon } from "@radix-ui/react-icons"

import { type ProviderSettings, type ProviderSettingsEntry } from "@roo-code/types"
import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@src/components/ui/alert-dialog"
import { inputEventTransform } from "../transforms"

type VirtualProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

type VirtualProviderData = {
	providerName?: string
	providerId?: string
	providerLimits?: {
		tokensPerMinute?: number
		tokensPerHour?: number
		tokensPerDay?: number
		requestsPerMinute?: number
		requestsPerHour?: number
		requestsPerDay?: number
	}
}

type LimitInputsProps = {
	provider: VirtualProviderData
	index: number
	onProviderChange: (index: number, provider: VirtualProviderData) => void
}

const LimitInputs = ({ provider, index, onProviderChange }: LimitInputsProps) => {
	const handleLimitChange = useCallback(
		(limitKey: keyof NonNullable<VirtualProviderData["providerLimits"]>) => (event: any) => {
			const value = inputEventTransform(event)
			const updatedProvider = {
				...provider,
				providerLimits: {
					...provider.providerLimits,
					[limitKey]: value === "" ? undefined : Number(value),
				},
			}
			onProviderChange(index, updatedProvider)
		},
		[provider, index, onProviderChange],
	)

	if (!provider.providerId) {
		return null
	}

	return (
		<div className="grid grid-cols-2 gap-x-4 gap-y-2 p-2 border border-vscode-settings-sashBorder rounded-md mt-2">
			{/* Tokens Column */}
			<div className="space-y-2">
				<div>
					<label className="block text-sm font-medium mb-1">
						<Trans i18nKey="settings:providers.virtual.tokensPerMinute">Tokens/min</Trans>
					</label>
					<VSCodeTextField
						value={provider.providerLimits?.tokensPerMinute?.toString() ?? ""}
						onInput={handleLimitChange("tokensPerMinute")}
						className="w-full"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium mb-1">
						<Trans i18nKey="settings:providers.virtual.tokensPerHour">Tokens/hr</Trans>
					</label>
					<VSCodeTextField
						value={provider.providerLimits?.tokensPerHour?.toString() ?? ""}
						onInput={handleLimitChange("tokensPerHour")}
						className="w-full"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium mb-1">
						<Trans i18nKey="settings:providers.virtual.tokensPerDay">Tokens/day</Trans>
					</label>
					<VSCodeTextField
						value={provider.providerLimits?.tokensPerDay?.toString() ?? ""}
						onInput={handleLimitChange("tokensPerDay")}
						className="w-full"
					/>
				</div>
			</div>

			{/* Requests Column */}
			<div className="space-y-2">
				<div>
					<label className="block text-sm font-medium mb-1">
						<Trans i18nKey="settings:providers.virtual.requestsPerMinute">Requests/min</Trans>
					</label>
					<VSCodeTextField
						value={provider.providerLimits?.requestsPerMinute?.toString() ?? ""}
						onInput={handleLimitChange("requestsPerMinute")}
						className="w-full"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium mb-1">
						<Trans i18nKey="settings:providers.virtual.requestsPerHour">Requests/hr</Trans>
					</label>
					<VSCodeTextField
						value={provider.providerLimits?.requestsPerHour?.toString() ?? ""}
						onInput={handleLimitChange("requestsPerHour")}
						className="w-full"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium mb-1">
						<Trans i18nKey="settings:providers.virtual.requestsPerDay">Requests/day</Trans>
					</label>
					<VSCodeTextField
						value={provider.providerLimits?.requestsPerDay?.toString() ?? ""}
						onInput={handleLimitChange("requestsPerDay")}
						className="w-full"
					/>
				</div>
			</div>
		</div>
	)
}

export const Virtual = ({ apiConfiguration, setApiConfigurationField }: VirtualProps) => {
	const { listApiConfigMeta, currentApiConfigName } = useExtensionState()
	const [isAlertOpen, setIsAlertOpen] = useState(false)

	// Get current profile ID to exclude from available providers
	const currentProfile = listApiConfigMeta?.find((config) => config.name === currentApiConfigName)
	const currentProfileId = currentProfile?.id

	// Filter out virtual provider profiles and current profile
	const availableProfiles = useMemo(() => {
		return (
			listApiConfigMeta?.filter((profile: ProviderSettingsEntry) => {
				return profile.apiProvider !== "virtual" && profile.id !== currentProfileId
			}) || []
		)
	}, [listApiConfigMeta, currentProfileId])

	// Get providers array - use new format if available, otherwise convert from legacy format
	const providers = useMemo(() => {
		if (apiConfiguration.providers && apiConfiguration.providers.length > 0) {
			return apiConfiguration.providers
		}
		// Convert legacy format to new format
		const legacyProviders = []
		if (apiConfiguration.primaryProvider) legacyProviders.push(apiConfiguration.primaryProvider)
		if (apiConfiguration.secondaryProvider) legacyProviders.push(apiConfiguration.secondaryProvider)
		if (apiConfiguration.backupProvider) legacyProviders.push(apiConfiguration.backupProvider)
		return legacyProviders.length > 0 ? legacyProviders : [{}]
	}, [apiConfiguration])

	const updateProviders = useCallback(
		(newProviders: VirtualProviderData[]) => {
			// Update the new array format
			setApiConfigurationField("providers", newProviders)
			// Clear legacy format to avoid confusion
			setApiConfigurationField("primaryProvider", undefined)
			setApiConfigurationField("secondaryProvider", undefined)
			setApiConfigurationField("backupProvider", undefined)
		},
		[setApiConfigurationField],
	)

	const handleProviderChange = useCallback(
		(index: number, provider: VirtualProviderData) => {
			const newProviders = [...providers]
			newProviders[index] = provider
			updateProviders(newProviders)
		},
		[providers, updateProviders],
	)

	const handleProviderSelect = useCallback(
		(index: number, selectedId: string) => {
			const selectedProfile = availableProfiles.find((profile) => profile.id === selectedId)
			if (selectedProfile) {
				const updatedProvider = {
					...providers[index],
					providerId: selectedProfile.id,
					providerName: selectedProfile.name,
				}
				handleProviderChange(index, updatedProvider)
			}
		},
		[availableProfiles, providers, handleProviderChange],
	)

	const addProvider = useCallback(() => {
		const newProviders = [...providers, {}]
		updateProviders(newProviders)
	}, [providers, updateProviders])

	const removeProvider = useCallback(
		(index: number) => {
			if (providers.length > 1) {
				const newProviders = providers.filter((_, i) => i !== index)
				updateProviders(newProviders)
			}
		},
		[providers, updateProviders],
	)

	const handleClearUsageData = useCallback(() => {
		vscode.postMessage({ type: "clearUsageData" })
		setIsAlertOpen(false)
	}, [])

	const getUsedProviderIds = useCallback(
		(excludeIndex: number) => {
			return providers
				.map((p, i) => (i !== excludeIndex ? p.providerId : null))
				.filter((id): id is string => Boolean(id))
		},
		[providers],
	)

	return (
		<>
			<h3 className="text-lg font-medium mb-4">
				<Trans i18nKey="settings:providers.virtualTitle">Virtual Provider</Trans>
			</h3>
			<p className="text-sm text-vscode-descriptionForeground mb-4">
				<Trans i18nKey="settings:providers.virtualDescription">
					Configure multiple AI providers with automatic fallback when rate limits are reached.
				</Trans>
			</p>

			<div className="space-y-4">
				{providers.map((provider, index) => {
					const usedProviderIds = getUsedProviderIds(index)
					const availableForThisSlot = availableProfiles.filter(
						(profile) => !usedProviderIds.includes(profile.id),
					)

					return (
						<div key={index} className="border border-vscode-settings-sashBorder rounded-md p-4">
							<div className="flex items-center justify-between mb-3">
								<label className="block font-medium">
									Provider {index + 1} {index === 0 && "(Primary)"}
								</label>
								{providers.length > 1 && (
									<VSCodeButton
										appearance="icon"
										onClick={() => removeProvider(index)}
										title="Remove provider">
										<TrashIcon />
									</VSCodeButton>
								)}
							</div>

							<Select
								value={provider.providerId || ""}
								onValueChange={(value) => handleProviderSelect(index, value)}
								disabled={availableForThisSlot.length === 0}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select provider..." />
								</SelectTrigger>
								<SelectContent>
									{availableForThisSlot.map((profile) => (
										<SelectItem key={profile.id} value={profile.id}>
											{profile.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<LimitInputs provider={provider} index={index} onProviderChange={handleProviderChange} />
						</div>
					)
				})}

				<div className="flex justify-center">
					<VSCodeButton
						appearance="secondary"
						onClick={addProvider}
						disabled={availableProfiles.length <= providers.length}>
						<PlusIcon className="mr-2" />
						Add Provider
					</VSCodeButton>
				</div>

				{availableProfiles.length === 0 ? (
					<div className="text-sm text-vscode-descriptionForeground text-center p-4 border border-vscode-settings-sashBorder rounded-md">
						No provider profiles available. Please configure at least one non-virtual provider profile
						first.
					</div>
				) : (
					<div className="text-sm text-vscode-descriptionForeground text-center">
						Providers are tried in order. Configure rate limits to enable automatic fallback.
					</div>
				)}
			</div>

			<div className="mt-6 p-4 border border-vscode-editorWarning-foreground rounded-md">
				<h4 className="text-md font-semibold text-vscode-editorWarning-foreground">
					<Trans i18nKey="settings:providers.virtual.dangerZoneTitle">Danger Zone</Trans>
				</h4>
				<p className="text-sm text-vscode-descriptionForeground mt-1 mb-3">
					<Trans i18nKey="settings:providers.virtual.dangerZoneDescription">
						These actions are destructive and cannot be undone.
					</Trans>
				</p>
				<VSCodeButton appearance="secondary" onClick={() => setIsAlertOpen(true)}>
					<Trans i18nKey="settings:providers.virtual.clearUsageData">Clear Usage Data</Trans>
				</VSCodeButton>
			</div>

			<AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans i18nKey="settings:providers.virtual.confirmClearTitle">Are you sure?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans i18nKey="settings:providers.virtual.confirmClearDescription">
								This will permanently delete all stored usage data for virtual providers. This action
								cannot be undone.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans i18nKey="common:cancel">Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction onClick={handleClearUsageData}>
							<Trans i18nKey="common:confirm">Confirm</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
