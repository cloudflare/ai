import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		include: ["test/integration/**/*.test.ts"],
		globalSetup: ["test/integration/global-setup.ts"],
		testTimeout: 60000,
	},
});
