import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { handleWorkerScriptDownload, handleWorkersList } from "./workers";

beforeAll(() => {
	// Enable outbound request mocking...
	fetchMock.activate();
	// ...and throw errors if an outbound request isn't mocked
	fetchMock.disableNetConnect();
});

// Ensure we matched every mock we defined
afterEach(() => fetchMock.assertNoPendingInterceptors());

describe("Workers API", () => {
	describe("handleWorkersList", () => {
		it("should fetch workers correctly", async () => {
			const mockWorkerResponse = {
				result: [
					{
						id: "worker-1",
						modified_on: "2023-01-01T00:00:00Z",
					},
					{
						id: "worker-2",
						modified_on: "2023-01-02T00:00:00Z",
					},
				],
				success: true,
				errors: [],
				messages: [],
			};

			fetchMock
				.get("https://api.cloudflare.com")
				.intercept({
					method: "GET",
					path: `/client/v4/accounts/${env.CLOUDFLARE_MOCK_ACCOUNT_ID}/workers/scripts`,
				})
				.reply(200, mockWorkerResponse);

			const result = await handleWorkersList({
				accountId: env.CLOUDFLARE_MOCK_ACCOUNT_ID,
				apiToken: env.CLOUDFLARE_MOCK_API_TOKEN,
			});

			expect(result).toEqual(mockWorkerResponse.result);
			expect(result.length).toBe(2);
			expect(result[0].id).toBe("worker-1");
			expect(result[1].id).toBe("worker-2");
		});

		it("should handle API errors", async () => {
			fetchMock
				.get("https://api.cloudflare.com")
				.intercept({
					method: "GET",
					path: `/client/v4/accounts/${env.CLOUDFLARE_MOCK_ACCOUNT_ID}/workers/scripts`,
				})
				.reply(500, "Server error");

			await expect(
				handleWorkersList({
					accountId: env.CLOUDFLARE_MOCK_ACCOUNT_ID,
					apiToken: env.CLOUDFLARE_MOCK_API_TOKEN,
				}),
			).rejects.toThrow("Cloudflare API request failed");
		});
	});

	describe("handleWorkerScriptDownload", () => {
		it("should download a worker script correctly", async () => {
			const scriptName = "test-worker";
			const mockScriptContent =
				'addEventListener("fetch", event => { event.respondWith(new Response("Hello World")) })';

			fetchMock
				.get("https://api.cloudflare.com")
				.intercept({
					method: "GET",
					path: `/client/v4/accounts/${env.CLOUDFLARE_MOCK_ACCOUNT_ID}/workers/scripts/${scriptName}`,
				})
				.reply(200, mockScriptContent, {
					headers: {
						"Content-Type": "application/javascript",
					},
				});

			const result = await handleWorkerScriptDownload({
				scriptName,
				accountId: env.CLOUDFLARE_MOCK_ACCOUNT_ID,
				apiToken: env.CLOUDFLARE_MOCK_API_TOKEN,
			});

			expect(result).toEqual(mockScriptContent);
		});

		it("should handle API errors when downloading scripts", async () => {
			const scriptName = "non-existent-worker";

			// Setup mock for error response
			fetchMock
				.get("https://api.cloudflare.com")
				.intercept({
					method: "GET",
					path: `/client/v4/accounts/${env.CLOUDFLARE_MOCK_ACCOUNT_ID}/workers/scripts/${scriptName}`,
				})
				.reply(404, "Worker script not found");

			await expect(
				handleWorkerScriptDownload({
					scriptName,
					accountId: env.CLOUDFLARE_MOCK_ACCOUNT_ID,
					apiToken: env.CLOUDFLARE_MOCK_API_TOKEN,
				}),
			).rejects.toThrow("Failed to download worker script");
		});
	});
});
