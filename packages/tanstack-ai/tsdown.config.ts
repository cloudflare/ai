import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/adapters/anthropic.ts",
		"src/adapters/gemini.ts",
		"src/adapters/grok.ts",
		"src/adapters/openai.ts",
		"src/adapters/openrouter.ts",
		"src/adapters/workers-ai.ts",
		"src/adapters/workers-ai-image.ts",
		"src/adapters/workers-ai-transcription.ts",
		"src/adapters/workers-ai-tts.ts",
		"src/adapters/workers-ai-summarize.ts",
	],
	sourcemap: true,
	clean: true,
	dts: true,
	format: ["cjs", "esm"],
	deps: { skipNodeModulesBundle: true },
	target: "es2020",
});
