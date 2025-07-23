import { useCallback, useMemo, useState, type ChangeEvent } from "react"
import { Trans } from "react-i18next"
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

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

type VirtualProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

type LimitInputsProps = {
	providerKey: "primaryProvider" | "secondaryProvider"
	apiConfiguration: ProviderSettings
	handleInputChange: <K extends keyof ProviderSettings, E>(
		field: K,
		transform: (event: E) => ProviderSettings[K],
	) => (event: E | Event) => void
	limitTransformFactory: (
		providerKey: "primaryProvider" | "secondaryProvider",
		limitKey: keyof NonNullable<NonNullable<ProviderSettings["primaryProvider"]>["providerLimits"]>,
	) => (e: any) => ProviderSettings["primaryProvider"]
}

const LimitInputs = ({ providerKey, apiConfiguration, handleInputChange, limitTransformFactory }: LimitInputsProps) => {
	const provider = apiConfiguration[providerKey]
	if (!provider?.providerId) {
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
						onInput={handleInputChange(providerKey, limitTransformFactory(providerKey, "tokensPerMinute"))}
						className="w-full"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium mb-1">
						<Trans i18nKey="settings:providers.virtual.tokensPerHour">Tokens/hr</Trans>
					</label>
					<VSCodeTextField
						value={provider.providerLimits?.tokensPerHour?.toString() ?? ""}
						onInput={handleInputChange(providerKey, limitTransformFactory(providerKey, "tokensPerHour"))}
						className="w-full"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium mb-1">
						<Trans i18nKey="settings:providers.virtual.tokensPerDay">Tokens/day</Trans>
					</label>
					<VSCodeTextField
						value={provider.providerLimits?.tokensPerDay?.toString() ?? ""}
						onInput={handleInputChange(providerKey, limitTransformFactory(providerKey, "tokensPerDay"))}
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
						onInput={handleInputChange(
							providerKey,
							limitTransformFactory(providerKey, "requestsPerMinute"),
						)}
						className="w-full"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium mb-1">
						<Trans i18nKey="settings:providers.virtual.requestsPerHour">Requests/hr</Trans>
					</label>
					<VSCodeTextField
						value={provider.providerLimits?.requestsPerHour?.toString() ?? ""}
						onInput={handleInputChange(providerKey, limitTransformFactory(providerKey, "requestsPerHour"))}
						className="w-full"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium mb-1">
						<Trans i18nKey="settings:providers.virtual.requestsPerDay">Requests/day</Trans>
					</label>
					<VSCodeTextField
						value={provider.providerLimits?.requestsPerDay?.toString() ?? ""}
						onInput={handleInputChange(providerKey, limitTransformFactory(providerKey, "requestsPerDay"))}
						className="w-full"
					/>
				</div>
			</div>
		</div>
	)
}

export const Virtual = ({ apiConfiguration, setApiConfigurationField }: VirtualProps) => {
	const { listApiConfigMeta } = useExtensionState()
	const [isAlertOpen, setIsAlertOpen] = useState(false)

	const handleClearUsageData = useCallback(() => {
		vscode.postMessage({ type: "clearUsageData" })
		setIsAlertOpen(false)
	}, [])
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
	const { currentApiConfigName } = useExtensionState()

	// Find the current profile's ID
	const currentProfile = listApiConfigMeta?.find((config) => config.name === currentApiConfigName)
	const currentProfileId = currentProfile?.id
	// Filter out virtual provider profiles
	const availableProfiles = useMemo(() => {
		const filtered =
			listApiConfigMeta?.filter((profile: ProviderSettingsEntry) => {
				return profile.apiProvider !== "virtual" && profile.id !== currentProfileId
				// There's a goofy behavior where a newly created profile inherits the apiProvider
				// of the previously viewed profile.  This means we can't filter out ourselves when
				// a new virtual provider profile is created.  So we exclude anything with apiProvider == "virtual"
				// or rofile.id == currentProfileId. (ourselves).
			}) || []
		return filtered
	}, [listApiConfigMeta, currentProfileId])

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

	const limitTransformFactory = useCallback(
		(
			providerKey: "primaryProvider" | "secondaryProvider",
			limitKey: keyof NonNullable<NonNullable<ProviderSettings["primaryProvider"]>["providerLimits"]>,
		) =>
			(event: any) => {
				const value = (event.target as HTMLInputElement).value
				const currentProvider = apiConfiguration[providerKey]

				const newProviderData = {
					...currentProvider,
					providerLimits: {
						...currentProvider?.providerLimits,
						[limitKey]: value === "" ? undefined : Number(value),
					},
				}
				return newProviderData as ProviderSettings[typeof providerKey]
			},
		[apiConfiguration],
	)

	return (
		<>
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
					<LimitInputs
						providerKey="primaryProvider"
						apiConfiguration={apiConfiguration}
						handleInputChange={handleInputChange}
						limitTransformFactory={limitTransformFactory}
					/>
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
					<LimitInputs
						providerKey="secondaryProvider"
						apiConfiguration={apiConfiguration}
						handleInputChange={handleInputChange}
						limitTransformFactory={limitTransformFactory}
					/>
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
