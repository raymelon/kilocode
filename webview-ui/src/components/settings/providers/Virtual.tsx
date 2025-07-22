import { useCallback, useMemo } from "react"
import { Trans } from "react-i18next"

import { type ProviderSettings, type ProviderSettingsEntry } from "@roo-code/types"

import { useExtensionState } from "@src/context/ExtensionStateContext"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"

type VirtualProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const Virtual = ({ apiConfiguration, setApiConfigurationField }: VirtualProps) => {
	const { listApiConfigMeta } = useExtensionState()

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = (event: any) => event.target.value,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	// Filter out virtual provider profiles
	const availableProfiles = useMemo(() => {
		return listApiConfigMeta?.filter((profile: ProviderSettingsEntry) => profile.apiProvider !== "virtual") || []
	}, [listApiConfigMeta])

	// Get current selections
	const primarySelection = apiConfiguration.primaryProvider?.providerId || ""
	const secondarySelection = apiConfiguration.secondaryProvider?.providerId || ""
	const backupSelection = apiConfiguration.backupProvider?.providerId || ""

	// Transform function for provider selection
	const providerTransform = useCallback(
		(selectedId: string) => {
			const selectedProfile = availableProfiles.find((profile) => profile.id === selectedId)
			if (selectedProfile) {
				return {
					providerId: selectedProfile.id,
					providerName: selectedProfile.name,
				}
			}
			return undefined
		},
		[availableProfiles],
	)

	return (
		<div>
			<h3 className="text-lg font-medium mb-4">
				<Trans i18nKey="settings:providers.virtualTitle">Virtual Provider</Trans>
			</h3>
			<p className="text-sm text-vscode-descriptionForeground mb-4">
				<Trans i18nKey="settings:providers.virtualDescription">
					This virtual provider allows you to use multiple AI providers through a single interface.
				</Trans>
			</p>

			<div className="space-y-3">
				{/* Primary Provider Dropdown */}
				<div>
					<label className="block font-medium mb-1">Primary Provider</label>
					<Select
						value={primarySelection}
						onValueChange={handleInputChange("primaryProvider", providerTransform)}
						disabled={availableProfiles.length === 0}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select primary provider..." />
						</SelectTrigger>
						<SelectContent>
							{availableProfiles
								.filter(
									(profile) => profile.id !== secondarySelection && profile.id !== backupSelection,
								)
								.map((profile) => (
									<SelectItem key={profile.id} value={profile.id}>
										{profile.name}
									</SelectItem>
								))}
						</SelectContent>
					</Select>
				</div>

				{/* Secondary Provider Dropdown */}
				<div>
					<label className="block font-medium mb-1">Secondary Provider</label>
					<Select
						value={secondarySelection}
						onValueChange={handleInputChange("secondaryProvider", providerTransform)}
						disabled={availableProfiles.length === 0}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select secondary provider..." />
						</SelectTrigger>
						<SelectContent>
							{availableProfiles
								.filter((profile) => profile.id !== primarySelection && profile.id !== backupSelection)
								.map((profile) => (
									<SelectItem key={profile.id} value={profile.id}>
										{profile.name}
									</SelectItem>
								))}
						</SelectContent>
					</Select>
				</div>

				{/* Backup Provider Dropdown */}
				<div>
					<label className="block font-medium mb-1">Backup Provider</label>
					<Select
						value={backupSelection}
						onValueChange={handleInputChange("backupProvider", providerTransform)}
						disabled={availableProfiles.length === 0}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select backup provider..." />
						</SelectTrigger>
						<SelectContent>
							{availableProfiles
								.filter(
									(profile) => profile.id !== primarySelection && profile.id !== secondarySelection,
								)
								.map((profile) => (
									<SelectItem key={profile.id} value={profile.id}>
										{profile.name}
									</SelectItem>
								))}
						</SelectContent>
					</Select>
				</div>

				{/* Status message */}
				{availableProfiles.length === 0 ? (
					<div className="text-sm text-vscode-descriptionForeground">
						No provider profiles available. Please configure at least one non-virtual provider profile
						first.
					</div>
				) : (
					<div className="text-sm text-vscode-descriptionForeground">
						Configure your primary, secondary, and backup providers to enable fallback behavior.
					</div>
				)}
			</div>
		</div>
	)
}
