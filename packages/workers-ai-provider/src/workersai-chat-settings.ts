import type { StringLike } from "./utils";

export type WorkersAIChatSettings = {
	/**
	 * Whether to inject a safety prompt before all conversations.
	 * Defaults to `false`.
	 */
	safePrompt?: boolean;

	/**
	 * Optionally set Cloudflare AI Gateway options.
	 */
	gateway?: GatewayOptions;
} & {
	/**
	 * Passthrough settings that are provided directly to the run function.
	 */
	[key: string]: StringLike;
};
