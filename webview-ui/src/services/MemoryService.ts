// kilocode_change - new file
import { telemetryClient } from "../utils/TelemetryClient"
import { TelemetryEventName, type MemoryMetrics } from "@roo-code/types"

export class MemoryService {
	private intervalId: number | null = null
	private readonly intervalMs: number = 60 * 1000

	public start(): void {
		if (this.intervalId) {
			return
		}
		this.reportMemoryUsage()

		this.intervalId = window.setInterval(() => {
			this.reportMemoryUsage()
		}, this.intervalMs)
	}

	public stop(): void {
		if (this.intervalId) {
			window.clearInterval(this.intervalId)
			this.intervalId = null
		}
	}

	private reportMemoryUsage(): void {
		const memoryInfo = this.getMemoryInfo()
		telemetryClient.capture(TelemetryEventName.WEBVIEW_MEMORY_USAGE, memoryInfo)
	}

	private getMemoryInfo(): MemoryMetrics {
		const memory = (performance as Performance & { memory?: any }).memory
		if (!memory) {
			return {
				heapUsed: 0,
				heapTotal: 0,
			}
		}

		return {
			heapUsed: this.bytesToMegabytes(memory.usedJSHeapSize || 0),
			heapTotal: this.bytesToMegabytes(memory.totalJSHeapSize || 0),
		}
	}

	private bytesToMegabytes(bytes: number): number {
		return Math.round((bytes / 1024 / 1024) * 100) / 100
	}
}
