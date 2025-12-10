import { useState } from "react";
import "./App.css";

function App() {
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const testOpenAI = async () => {
    setLoading(true);
    setResponse("");

    try {
      const res = await fetch("/api/anthropic-byok");
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No reader available");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        setResponse((prev) => prev + text);
      }
    } catch (error) {
      setResponse(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🚀 TanStack AI + Cloudflare AI Gateway</h1>
        <p className="subtitle">
          Demonstrating <code>@harshil1712/tanstack-cf-ai-adapter</code>
        </p>
      </header>

      <main className="main">
        <div className="card">
          <h2>Test OpenAI Streaming</h2>
          <p className="description">
            Click to generate a haiku using <strong>GPT-4</strong> through AI
            Gateway
          </p>
          <button className="test-btn" onClick={testOpenAI} disabled={loading}>
            {loading ? "⏳ Streaming..." : "▶️ Test Streaming"}
          </button>

          {response && (
            <div className="response-box">
              <h3>Response:</h3>
              <pre>{response}</pre>
            </div>
          )}
        </div>

        <div className="info-card">
          <h3>✅ What's Happening</h3>
          <ul>
            <li>
              Requests are routed through <strong>Cloudflare AI Gateway</strong>
            </li>
            <li>
              Responses are <strong>streamed in real-time</strong> using
              TanStack AI
            </li>
            <li>
              Check your{" "}
              <a
                href="https://dash.cloudflare.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Cloudflare Dashboard
              </a>{" "}
              → AI Gateway for analytics
            </li>
          </ul>
        </div>

        <div className="links">
          <a
            href="https://github.com/harshil1712/tanstack-cf-ai-adapter"
            target="_blank"
            rel="noopener noreferrer"
          >
            📦 GitHub
          </a>
          <a
            href="https://tanstack.com/ai"
            target="_blank"
            rel="noopener noreferrer"
          >
            📚 TanStack AI Docs
          </a>
          <a
            href="https://developers.cloudflare.com/ai-gateway/"
            target="_blank"
            rel="noopener noreferrer"
          >
            🌐 AI Gateway Docs
          </a>
        </div>
      </main>
    </div>
  );
}

export default App;
