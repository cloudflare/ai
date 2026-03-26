import { defineConfig } from "tsdown";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
	entry: ["src/index.ts", "src/providers/*"],
	sourcemap: true,
	clean: true,
	dts: true,
	format: ["cjs", "esm"],
	deps: {
		neverBundle: Object.keys(pkg.optionalDependencies ?? {}).filter(
			(dep) => dep !== "@ai-sdk/google-vertex",
		),
	},
	target: "es2020",
});
