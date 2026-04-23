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

	/**
	 * Session affinity key for prefix-cache optimization.
	 * Routes requests with the same key to the same backend replica.
	 */
	sessionAffinity?: string;

	/**
	 * Controls the reasoning budget for reasoning-capable Workers AI models
	 * (e.g. `@cf/zai-org/glm-4.7-flash`, `@cf/moonshotai/kimi-k2.5`,
	 * `@cf/openai/gpt-oss-120b`).
	 *
	 * `null` is a valid value and disables reasoning for models that support it.
	 * Forwarded on the `inputs` object of `binding.run(model, inputs)`.
	 */
	reasoning_effort?: "low" | "medium" | "high" | null;

	/**
	 * Chat-template overrides for reasoning-capable models that expose
	 * thinking toggles (e.g. GLM, Kimi).
	 *
	 * Forwarded on the `inputs` object of `binding.run(model, inputs)`.
	 */
	chat_template_kwargs?: {
		/** Whether to enable reasoning. Enabled by default on reasoning models. */
		enable_thinking?: boolean;
		/** If false, preserves reasoning context between turns. */
		clear_thinking?: boolean;
	};

	/**
	 * Passthrough settings that are provided directly to the run function.
	 * Use this for any provider-specific options not covered by the typed fields.
	 */
	[key: string]: unknown;
};
