import type { Config } from "tailwindcss";

export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		fontFamily: {
			system: [
				"-apple-system",
				"BlinkMacSystemFont",
				"Segoe UI",
				"Roboto",
				"Oxygen",
				"Ubuntu",
				"Cantarell",
				"Fira Sans",
				"Droid Sans",
				"Helvetica Neue",
				"sans-serif",
			],
			mono: [
				"ui-monospace",
				"SFMono-Regular",
				"Menlo",
				"Monaco",
				"Consolas",
				"Liberation Mono",
				"Courier New",
				"monospace",
			],
		},
		extend: {
			backgroundImage: {
				ai: "linear-gradient(75deg, #901475, #CE2F55, #FF6633)",
				"ai-loop": "linear-gradient(75deg, #901475, #CE2F55, #FF6633, #CE2F55, #901475)",
			},
			animation: {
				"gradient-background": "gradient-background 3s linear infinite",
			},
			keyframes: {
				"gradient-background": {
					"0%": { backgroundPosition: "0% 0%" },
					"100%": { backgroundPosition: "200% 0%" },
				},
			},
		},
	},
	plugins: [],
} satisfies Config;
