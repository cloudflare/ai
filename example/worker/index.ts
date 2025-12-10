import { Hono } from "hono";
import { chat, toStreamResponse } from "@tanstack/ai";
import { openaiGateway, anthropicGateway } from "../../src";

const app = new Hono<{ Bindings: Cloudflare.Env }>();

app.get("/api/", (c) =>
  c.json({
    name: "TanStack AI + Cloudflare AI Gateway Example",
    endpoints: ["/api/openai - Test OpenAI (GPT) with AI Gateway"],
  })
);

/**
 * Example: OpenAI (GPT) with AI Gateway
 */
app.get("/api/openai", async (c) => {
  try {
    // Create OpenAI adapter configured for AI Gateway
    // Replace 'my-gateway' with your gateway name
    const adapter = await openaiGateway(c.env.AI, "fun-demo", {
      apiKey: c.env.OPENAI_API_KEY,
    });

    // Use the adapter with TanStack AI's chat function
    // All requests go through AI Gateway!
    const stream = await chat({
      adapter,
      model: "gpt-4",
      messages: [
        {
          role: "user",
          content: "Write a haiku about serverless computing",
        },
      ],
    });

    // Convert TanStack AI stream to Response using toStreamResponse
    return toStreamResponse(stream);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.get("/api/openai-unified", async (c) => {
  try {
    // Intercept fetch to log what's being sent
    const originalFetch = globalThis.fetch;
    console.log("Helo");
    globalThis.fetch = async (url, init) => {
      console.log("=== FETCH CALLED ===");
      console.log("URL:", url);
      console.log("Headers:", init?.headers);
      return originalFetch(url, init);
    };

    const adapter = await openaiGateway(c.env.AI, "unified-billling-test", {
      unifiedBilling: true,
      cfToken: c.env.CF_API_TOKEN,
    });

    const stream = chat({
      adapter,
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
    });

    // Restore fetch
    globalThis.fetch = originalFetch;

    return toStreamResponse(stream);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// app.get("/api/openai-unified", async (c) => {
//   try {
//     const adapter = await openaiGateway(c.env.AI, "unified-billing", {
//       unifiedBilling: true,
//       cfToken: c.env.CF_API_TOKEN, // Cloudflare API token
//     });

//     const stream = chat({
//       adapter,
//       model: "gpt-4o-mini",
//       messages: [
//         {
//           role: "user",
//           content: "Hello",
//         },
//       ],
//     });

//     return toStreamResponse(stream);
//   } catch (error) {
//     return c.json({ error: error.message }, 500);
//   }
// });

app.get("/api/openai-byok", async (c) => {
  try {
    const adapter = await openaiGateway(c.env.AI, "fastflare-agents", {
      byok: true,
      cfToken: c.env.CF_API_TOKEN, // Cloudflare API token
    });

    const stream = chat({
      adapter,
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "hello",
        },
      ],
    });

    return toStreamResponse(stream);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Example: Anthropic with Unified Billing
 */
app.get("/api/anthropic-unified", async (c) => {
  try {
    const adapter = await anthropicGateway(c.env.AI, "unified-billling-test", {
      unifiedBilling: true,
      cfToken: c.env.CF_API_TOKEN,
    });

    const stream = chat({
      adapter,
      model: "claude-3-5-haiku",
      messages: [
        {
          role: "user",
          content: "Hello",
        },
      ],
    });

    return toStreamResponse(stream);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

/**
 * Example: Anthropic with BYOK
 */
app.get("/api/anthropic-byok", async (c) => {
  try {
    const adapter = await anthropicGateway(c.env.AI, "fastflare-agents", {
      byok: true,
      cfToken: c.env.CF_API_TOKEN,
    });

    const stream = chat({
      adapter,
      model: "claude-haiku-4-5",
      messages: [
        {
          role: "user",
          content: "Hello",
        },
      ],
    });

    return toStreamResponse(stream);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

export default app;
