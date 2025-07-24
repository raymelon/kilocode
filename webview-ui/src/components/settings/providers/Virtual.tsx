import { useCallback, useMemo, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { PlusIcon, TrashIcon } from "@radix-ui/react-icons"
import { ChevronUp, ChevronDown } from "lucide-react"

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

type VirtualQuotaFallbackProviderData = {
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
	provider: VirtualQuotaFallbackProviderData
	index: number
	onProviderChange: (index: number, provider: VirtualQuotaFallbackProviderData) => void
}

export const Virtual = ({ apiConfiguration, setApiConfigurationField }: VirtualProps) => {
	const { listApiConfigMeta, currentApiConfigName } = useExtensionState()
	const [isAlertOpen, setIsAlertOpen] = useState(false)
	const { t } = useTranslation()

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

	// Get providers array
	const providers = useMemo(() => {
		return apiConfiguration.providers && apiConfiguration.providers.length > 0 ? apiConfiguration.providers : [{}]
	}, [apiConfiguration.providers])

	const updateProviders = useCallback(
		(newProviders: VirtualQuotaFallbackProviderData[]) => {
			setApiConfigurationField("providers", newProviders)
		},
		[setApiConfigurationField],
	)

	const handleProviderChange = useCallback(
		(index: number, provider: VirtualQuotaFallbackProviderData) => {
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
	const moveProviderUp = useCallback(
		(index: number) => {
			if (index > 0) {
				const newProviders = [...providers]
				const temp = newProviders[index]
				newProviders[index] = newProviders[index - 1]
				newProviders[index - 1] = temp
				updateProviders(newProviders)
			}
		},
		[providers, updateProviders],
	)

	const moveProviderDown = useCallback(
		(index: number) => {
			if (index < providers.length - 1) {
				const newProviders = [...providers]
				const temp = newProviders[index]
				newProviders[index] = newProviders[index + 1]
				newProviders[index + 1] = temp
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
			<h3 className="text-lg font-medium mb-0">
				<Trans i18nKey="kilocode:virtualProvider.title">Virtual Provider Settings</Trans>
			</h3>
			<div className="text-sm text-vscode-descriptionForeground mb-4">
				<Trans i18nKey="kilocode:virtualProvider.description">
					Configure a list of providers each with their own limits. When one providers limits are reached, the
					next provider in the list will be used until none remain.
				</Trans>
			</div>

			<div className="space-y-1">
				{providers.map((provider, index) => {
					const usedProviderIds = getUsedProviderIds(index)
					const availableForThisSlot = availableProfiles.filter(
						(profile) => !usedProviderIds.includes(profile.id),
					)

					return (
						<div key={index} className="border border-vscode-settings-sashBorder rounded-md p-2">
							<div className="flex items-center justify-between mb-3">
								<label className="block font-medium">
									{index === 0
										? t("kilocode:virtualProvider.primaryProviderLabel", { number: index + 1 })
										: t("kilocode:virtualProvider.providerLabel", { number: index + 1 })}
								</label>
								<div className="flex items-center gap-1">
									{/* Move Up Button */}
									<VSCodeButton
										appearance="icon"
										onClick={() => moveProviderUp(index)}
										disabled={index === 0}
										title={t("kilocode:virtualProvider.moveProviderUp")}>
										<ChevronUp size={16} />
									</VSCodeButton>
									{/* Move Down Button */}
									<VSCodeButton
										appearance="icon"
										onClick={() => moveProviderDown(index)}
										disabled={index === providers.length - 1}
										title={t("kilocode:virtualProvider.moveProviderDown")}>
										<ChevronDown size={16} />
									</VSCodeButton>
									{/* Remove Button */}
									{providers.length > 1 && (
										<VSCodeButton
											appearance="icon"
											onClick={() => removeProvider(index)}
											title={t("kilocode:virtualProvider.removeProvider")}>
											<TrashIcon />
										</VSCodeButton>
									)}
								</div>
							</div>

							<Select
								value={provider.providerId || ""}
								onValueChange={(value) => handleProviderSelect(index, value)}
								disabled={availableForThisSlot.length === 0}>
								<SelectTrigger className="w-full">
									<SelectValue
										placeholder={t("kilocode:virtualProvider.selectProviderPlaceholder")}
									/>
								</SelectTrigger>
								<SelectContent>
									{availableForThisSlot.map((profile) => (
										<SelectItem key={profile.id} value={profile.id}>
											{profile.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<VirtualLimitInputs
								provider={provider}
								index={index}
								onProviderChange={handleProviderChange}
							/>
						</div>
					)
				})}

				<div className="flex justify-center p-4">
					<VSCodeButton
						appearance="secondary"
						onClick={addProvider}
						disabled={availableProfiles.length <= providers.length}>
						<PlusIcon className="mr-2" />
						<Trans i18nKey="kilocode:virtualProvider.addProvider">Add Provider</Trans>
					</VSCodeButton>
				</div>

				{availableProfiles.length === 0 ? (
					<div className="text-sm text-vscode-descriptionForeground text-center p-4 border border-vscode-settings-sashBorder rounded-md">
						<Trans i18nKey="kilocode:virtualProvider.noProvidersAvailable">
							No provider profiles available. Please configure at least one non-virtual provider profile
							first.
						</Trans>
					</div>
				) : null}
			</div>

			<div className="p-4 border border-vscode-editorWarning-foreground rounded-md">
				<div className="text-md font-semibold text-vscode-editorWarning-foreground">
					<Trans i18nKey="kilocode:virtualProvider.dangerZoneTitle">Danger Zone</Trans>
				</div>
				<p className="text-sm text-vscode-descriptionForeground mt-1 mb-3">
					<Trans i18nKey="kilocode:virtualProvider.dangerZoneDescription">
						These actions are destructive and cannot be undone.
					</Trans>
				</p>
				<VSCodeButton appearance="secondary" onClick={() => setIsAlertOpen(true)}>
					<Trans i18nKey="kilocode:virtualProvider.clearUsageData">Clear Usage Data</Trans>
				</VSCodeButton>
			</div>

			<AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans i18nKey="kilocode:virtualProvider.confirmClearTitle">Are you sure?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans i18nKey="kilocode:virtualProvider.confirmClearDescription">
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

const VirtualLimitInputs = ({ provider, index, onProviderChange }: LimitInputsProps) => {
	const handleLimitChange = useCallback(
		(limitKey: keyof NonNullable<VirtualQuotaFallbackProviderData["providerLimits"]>) => (event: any) => {
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
		<div className="space-y-4 p-2 rounded-md mt-2">
			{/* Tokens Row */}
			<div>
				<label className="block text-sm font-medium mb-2">
					<Trans i18nKey="kilocode:virtualProvider.tokensLabel">Tokens</Trans>
				</label>
				<div className="grid grid-cols-3 gap-x-4">
					<div>
						<label className="block text-xs text-vscode-descriptionForeground mb-1">
							<Trans i18nKey="kilocode:virtualProvider.perMinute">Per Minute</Trans>
						</label>
						<VSCodeTextField
							value={provider.providerLimits?.tokensPerMinute?.toString() ?? ""}
							onInput={handleLimitChange("tokensPerMinute")}
							className="w-full"
						/>
					</div>
					<div>
						<label className="block text-xs text-vscode-descriptionForeground mb-1">
							<Trans i18nKey="kilocode:virtualProvider.perHour">Per Hour</Trans>
						</label>
						<VSCodeTextField
							value={provider.providerLimits?.tokensPerHour?.toString() ?? ""}
							onInput={handleLimitChange("tokensPerHour")}
							className="w-full"
						/>
					</div>
					<div>
						<label className="block text-xs text-vscode-descriptionForeground mb-1">
							<Trans i18nKey="kilocode:virtualProvider.perDay">Per Day</Trans>
						</label>
						<VSCodeTextField
							value={provider.providerLimits?.tokensPerDay?.toString() ?? ""}
							onInput={handleLimitChange("tokensPerDay")}
							className="w-full"
						/>
					</div>
				</div>
			</div>

			{/* Requests Row */}
			<div>
				<label className="block text-sm font-medium mb-2">
					<Trans i18nKey="kilocode:virtualProvider.requestsLabel">Requests</Trans>
				</label>
				<div className="grid grid-cols-3 gap-x-4">
					<div>
						<label className="block text-xs text-vscode-descriptionForeground mb-1">
							<Trans i18nKey="kilocode:virtualProvider.perMinute">Per Minute</Trans>
						</label>
						<VSCodeTextField
							value={provider.providerLimits?.requestsPerMinute?.toString() ?? ""}
							onInput={handleLimitChange("requestsPerMinute")}
							className="w-full"
						/>
					</div>
					<div>
						<label className="block text-xs text-vscode-descriptionForeground mb-1">
							<Trans i18nKey="kilocode:virtualProvider.perHour">Per Hour</Trans>
						</label>
						<VSCodeTextField
							value={provider.providerLimits?.requestsPerHour?.toString() ?? ""}
							onInput={handleLimitChange("requestsPerHour")}
							className="w-full"
						/>
					</div>
					<div>
						<label className="block text-xs text-vscode-descriptionForeground mb-1">
							<Trans i18nKey="kilocode:virtualProvider.perDay">Per Day</Trans>
						</label>
						<VSCodeTextField
							value={provider.providerLimits?.requestsPerDay?.toString() ?? ""}
							onInput={handleLimitChange("requestsPerDay")}
							className="w-full"
						/>
					</div>
				</div>
			</div>
		</div>
	)
}
