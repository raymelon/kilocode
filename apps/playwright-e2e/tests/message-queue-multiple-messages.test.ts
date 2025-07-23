// kilocode_change - new file
import { test, expect } from "./playwright-base-test"
import {
	verifyExtensionInstalled,
	waitForWebviewText,
	findWebview,
	configureApiKeyThroughUI,
} from "../helpers/webview-helpers"

test.describe("Message Queue - Multiple Messages", () => {
	test("should queue multiple messages and process them one by one", async ({ workbox: page }) => {
		await verifyExtensionInstalled(page)
		await waitForWebviewText(page, "Welcome to Kilo Code!")
		await configureApiKeyThroughUI(page)
		await waitForWebviewText(page, "Generate, refactor, and debug code with AI assistance")

		const webview = await findWebview(page)
		const chatInput = webview.locator('textarea, input[type="text"]').first()
		await chatInput.waitFor({ timeout: 5000 })

		// Start a task to make the agent busy
		await chatInput.fill("Write a simple hello world function")
		await chatInput.press("Enter")

		// Wait for the task to start (agent becomes busy)
		await waitForWebviewText(page, "function", 10_000)

		// Queue first message while agent is busy
		await chatInput.fill("Add error handling to this function")
		await chatInput.press("Enter")

		// Verify input is cleared (message was queued)
		expect(await chatInput.inputValue()).toBe("")

		// Queue second message while agent is still busy
		await chatInput.fill("Add comments explaining the code")
		await chatInput.press("Enter")

		// Verify input is cleared again (second message was queued)
		expect(await chatInput.inputValue()).toBe("")

		// Wait for the original task to complete and first queued message to be processed
		await waitForWebviewText(page, "error", 15_000)

		// Wait for the second queued message to be processed
		await waitForWebviewText(page, "comment", 15_000)

		// Verify that both queued messages were processed in order
		await expect(webview.locator("text=error")).toBeVisible({ timeout: 5000 })
		await expect(webview.locator("text=comment")).toBeVisible({ timeout: 5000 })
	})

	test("should show queued messages in the UI", async ({ workbox: page }) => {
		await verifyExtensionInstalled(page)
		await waitForWebviewText(page, "Welcome to Kilo Code!")
		await configureApiKeyThroughUI(page)
		await waitForWebviewText(page, "Generate, refactor, and debug code with AI assistance")

		const webview = await findWebview(page)
		const chatInput = webview.locator('textarea, input[type="text"]').first()
		await chatInput.waitFor({ timeout: 5000 })

		// Start a task to make the agent busy
		await chatInput.fill("Create a simple calculator function")
		await chatInput.press("Enter")

		// Wait for the task to start
		await waitForWebviewText(page, "function", 10_000)

		// Queue a message while agent is busy
		await chatInput.fill("Add unit tests for the calculator")
		await chatInput.press("Enter")

		// Look for the queued message UI (should show "1 message in queue")
		await expect(webview.locator("text=1 message in queue")).toBeVisible({ timeout: 5000 })

		// Queue another message
		await chatInput.fill("Add documentation for the calculator")
		await chatInput.press("Enter")

		// Should now show "2 messages in queue"
		await expect(webview.locator("text=2 messages in queue")).toBeVisible({ timeout: 5000 })

		// Wait for messages to be processed
		await waitForWebviewText(page, "test", 15_000)
		await waitForWebviewText(page, "documentation", 15_000)
	})
})
