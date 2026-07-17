import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		passWithNoTests: true,
		exclude: ["test/e2e/**", "node_modules/**"],
	},
});
