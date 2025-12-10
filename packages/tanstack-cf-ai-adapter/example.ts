/**
 * Example usage of @harshil1712/tanstack-cf-ai-adapter
 *
 * ⚠️ THIS FILE CONTAINS SIMPLIFIED EXAMPLES
 *
 * For complete, working examples with Hono, React, and proper error handling,
 * see the `example/` directory in this repository.
 *
 * The examples below show the basic API usage.
 */

import { chat, toStreamResponse } from "@tanstack/ai";
import { openaiGateway, anthropicGateway } from "./src";

// Define your Worker environment with the AI binding
interface Env {
  AI: any; // The [ai] binding from wrangler.toml
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  CF_API_TOKEN?: string; // For BYOK mode
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Example 1: Standard authentication with OpenAI
    return handleOpenAIExample(request, env);

    // Example 2: Standard authentication with Anthropic
    // return handleAnthropicExample(request, env)

    // Example 3: BYOK (Bring Your Own Keys) - ✅ Working
    // return handleBYOKExample(request, env)

    // Example 4: Unified Billing - ⚠️ NOT working yet
    // return handleUnifiedBillingExample(request, env)
  },
};

/**
 * Example 1: OpenAI with standard authentication (✅ Working)
 */
async function handleOpenAIExample(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // Create OpenAI adapter configured for AI Gateway
    const adapter = await openaiGateway(env.AI, "my-gateway", {
      apiKey: env.OPENAI_API_KEY,
    });

    // Use with TanStack AI's chat function
    const stream = await chat({
      adapter,
      model: "gpt-4",
      messages: [
        {
          role: "user",
          content: "Write a haiku about Cloudflare Workers",
        },
      ],
    });

    // Convert to Response
    return toStreamResponse(stream);
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to process request",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Example 2: Anthropic with standard authentication (✅ Working)
 */
async function handleAnthropicExample(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const adapter = await anthropicGateway(env.AI, "my-gateway", {
      apiKey: env.ANTHROPIC_API_KEY,
    });

    const stream = await chat({
      adapter,
      model: "claude-3-haiku",
      messages: [
        {
          role: "user",
          content: "Hello!",
        },
      ],
    });

    return toStreamResponse(stream);
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Example 3: BYOK (Bring Your Own Keys) (✅ Working)
 *
 * Prerequisites:
 * 1. Go to Cloudflare Dashboard → AI Gateway → your-gateway
 * 2. Navigate to "Provider Keys" section
 * 3. Add your API key with a name (e.g., "OPENAI_KEY_1")
 * 4. Get a Cloudflare API token from your account settings
 */
async function handleBYOKExample(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.CF_API_TOKEN) {
    return new Response("CF_API_TOKEN not configured", { status: 500 });
  }

  try {
    const adapter = await openaiGateway(env.AI, "my-gateway", {
      byok: true, // Use stored keys from dashboard
      cfToken: env.CF_API_TOKEN,
    });

    const stream = await chat({
      adapter,
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello!" }],
    });

    return toStreamResponse(stream);
  } catch (error) {
    return new Response(JSON.stringify({ error: "BYOK request failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Example 4: Unified Billing (⚠️ NOT WORKING YET)
 *
 * This mode is accepted in the API but not yet functional.
 * Use standard authentication or BYOK instead.
 */
async function handleUnifiedBillingExample(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.CF_API_TOKEN) {
    return new Response("CF_API_TOKEN not configured", { status: 500 });
  }

  try {
    // ⚠️ This will not work - unified billing is not implemented yet
    const adapter = await openaiGateway(env.AI, "my-gateway", {
      unifiedBilling: true,
      cfToken: env.CF_API_TOKEN,
    });

    const stream = await chat({
      adapter,
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello!" }],
    });

    return toStreamResponse(stream);
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Unified billing not yet supported" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Example wrangler.toml configuration:
 *
 * name = "my-ai-worker"
 * main = "src/index.ts"
 * compatibility_date = "2024-12-05"
 *
 * [ai]
 * binding = "AI"
 *
 * # Add your API keys as secrets with:
 * # wrangler secret put OPENAI_API_KEY
 * # wrangler secret put ANTHROPIC_API_KEY
 * # wrangler secret put CF_API_TOKEN (for BYOK)
 */
