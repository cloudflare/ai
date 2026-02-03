import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig({
	entry: ["src/index.ts", "src/adapters/**/*"],
	splitting: false,
	sourcemap: false,
	clean: true,
	dts: true,
	format: ["cjs", "esm"],
	external: Object.keys(pkg.optionalDependencies ?? {}).filter(
		(dep) => dep !== "@ai-sdk/google-vertex",
	),
	target: "es2020",
});
