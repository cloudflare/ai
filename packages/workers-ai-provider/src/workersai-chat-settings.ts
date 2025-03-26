export interface WorkersAIChatSettings {
	/**
	 * Whether to inject a safety prompt before all conversations.
	 * Defaults to `false`.
	 */
	safePrompt?: boolean;

	/**
	 * Optionally set Cloudflare AI Gateway options.
	 * @deprecated
	 */
	gateway?: GatewayOptions;
}
