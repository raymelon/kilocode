import * as vscode from "vscode"
import { MemoryPressureService } from "./MemoryPressureService"

/**
 * Register memory monitoring commands
 */
export function registerMemoryCommands(context: vscode.ExtensionContext): void {
	const memoryService = MemoryPressureService.getInstance()

	// Start memory monitoring
	const startMonitoringCommand = vscode.commands.registerCommand("kilocode.memory.startMonitoring", () => {
		memoryService.startMonitoring()
		vscode.window.showInformationMessage("Memory monitoring started")
	})

	// Stop memory monitoring
	const stopMonitoringCommand = vscode.commands.registerCommand("kilocode.memory.stopMonitoring", () => {
		memoryService.stopMonitoring()
		vscode.window.showInformationMessage("Memory monitoring stopped")
	})

	// Show memory details
	const showDetailsCommand = vscode.commands.registerCommand("kilocode.memory.showDetails", () => {
		memoryService.showMemoryDetails()
	})

	// Show current memory stats in status bar message
	const showStatsCommand = vscode.commands.registerCommand("kilocode.memory.showStats", () => {
		const stats = memoryService.getMemoryStatsFormatted()
		vscode.window.showInformationMessage(`Memory Usage: ${stats}`)
	})

	// Register all commands with context
	context.subscriptions.push(startMonitoringCommand, stopMonitoringCommand, showDetailsCommand, showStatsCommand)

	// Auto-start monitoring when extension activates
	memoryService.startMonitoring()

	// Ensure cleanup on extension deactivation
	context.subscriptions.push({
		dispose: () => {
			memoryService.dispose()
		},
	})
}
