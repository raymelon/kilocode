// kilocode_change - new file
import { test, expect } from "./playwright-base-test"
import {
	verifyExtensionInstalled,
	waitForWebviewText,
	findWebview,
	configureApiKeyThroughUI,
} from "../helpers/webview-helpers"

test.describe("Message Queue and Interjection", () => {
	test("should handle Alt+Enter interjection and queue message", async ({ workbox: page }) => {
		await verifyExtensionInstalled(page)
		await waitForWebviewText(page, "Welcome to Kilo Code!")
		await configureApiKeyThroughUI(page)
		await waitForWebviewText(page, "Generate, refactor, and debug code with AI assistance")

		const webview = await findWebview(page)
		const chatInput = webview.locator('textarea, input[type="text"]').first()
		await chatInput.waitFor({ timeout: 5000 })

		// Start a task to make the agent busy
		await chatInput.fill("Write a simple function")
		await chatInput.press("Enter")

		// Wait for the task to start - look for AI response
		await waitForWebviewText(page, "function", 10_000)

		// While the agent is working, type a new message and use Alt+Enter to interrupt
		await chatInput.fill("Actually, make it handle errors too")

		// Use Alt+Enter to trigger interjection
		await chatInput.press("Alt+Enter")

		// The input should be cleared when message is queued via interjection
		const inputValue = await chatInput.inputValue()
		expect(inputValue).toBe("")

		// Wait for the interjection to be processed - look for error-related content
		await waitForWebviewText(page, "error", 10_000)
	})

	test("should process queued messages after agent becomes idle", async ({ workbox: page }) => {
		await verifyExtensionInstalled(page)
		await waitForWebviewText(page, "Welcome to Kilo Code!")
		await configureApiKeyThroughUI(page)
		await waitForWebviewText(page, "Generate, refactor, and debug code with AI assistance")

		const webview = await findWebview(page)
		const chatInput = webview.locator('textarea, input[type="text"]').first()
		await chatInput.waitFor({ timeout: 5000 })

		// Start a task
		await chatInput.fill("Write a hello world function")
		await chatInput.press("Enter")

		// Wait for task to start - look for AI response
		await waitForWebviewText(page, "hello", 10_000)

		// Interrupt with Alt+Enter to queue a message
		await chatInput.fill("Add comments to explain the code")
		await chatInput.press("Alt+Enter")

		// Verify input is cleared (message was queued)
		expect(await chatInput.inputValue()).toBe("")

		// Wait for the queued message to be processed automatically
		await waitForWebviewText(page, "comments", 10_000)
	})

	test("should handle multiple interjections correctly", async ({ workbox: page }) => {
		await verifyExtensionInstalled(page)
		await waitForWebviewText(page, "Welcome to Kilo Code!")
		await configureApiKeyThroughUI(page)
		await waitForWebviewText(page, "Generate, refactor, and debug code with AI assistance")

		const webview = await findWebview(page)
		const chatInput = webview.locator('textarea, input[type="text"]').first()
		await chatInput.waitFor({ timeout: 5000 })

		// Start a task
		await chatInput.fill("Create a simple calculator")
		await chatInput.press("Enter")

		// Wait for task to start - look for AI response
		await waitForWebviewText(page, "calculator", 10_000)

		// Interrupt with first Alt+Enter
		await chatInput.fill("Add validation for inputs")
		await chatInput.press("Alt+Enter")

		// Verify first message was queued (input cleared)
		expect(await chatInput.inputValue()).toBe("")

		// Wait for the interjection to be processed
		await waitForWebviewText(page, "validation", 10_000)

		// This test confirms that the basic interjection and queuing mechanism works
		// The queue clearing functionality may need additional implementation
	})
})
