import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useAgent } from "agents/react";

type ReproResult = {
  a: string | null;
  b: string | null;
  errors: Array<string | null>;
  gatewayBodies: Array<Array<string | null>>;
  reproduced: boolean;
};

function App() {
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const add = (message: string) =>
    setLog((lines) => [...lines, `${new Date().toISOString()} ${message}`]);

  useAgent({
    agent: "repro-agent",
    name: "demo",
    onOpen: () => add("agent websocket connected"),
    onClose: () => add("agent websocket closed"),
    onMessage: (event) => add(`websocket recv: ${event.data}`),
  });

  const trigger = async () => {
    setRunning(true);
    setLog([]);
    add("starting Promise.all([ask('A'), ask('B')]) on one shared model");
    try {
      const response = await fetch("/agents/repro-agent/demo/run", { method: "POST" });
      const result = (await response.json()) as ReproResult;
      add(`HTTP ${response.status}`);
      add(`actual a=${JSON.stringify(result.a)}, b=${JSON.stringify(result.b)}`);
      add(`actual gatewayBodies=${JSON.stringify(result.gatewayBodies)}`);
      add("expected a=\"ANSWER:A\", b=\"ANSWER:B\"");
      add("expected gatewayBodies=[[\"A\"],[\"B\"]]");
      if (result.errors.some(Boolean)) add(`errors=${JSON.stringify(result.errors)}`);
      add(result.reproduced ? "BUG REPRODUCED: concurrent calls were not isolated" : "Bug not observed in this run");
    } catch (error) {
      add(`trigger failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <main style={{ fontFamily: "monospace", maxWidth: 960, margin: "2rem auto", padding: 16 }}>
      <h1>cloudflare/ai #620 concurrency repro</h1>
      <p>
        <strong>Expected:</strong> two concurrent calls through one shared AI Gateway model receive
        their own answers and produce one gateway request apiece.
      </p>
      <p>
        <strong>Actual bug:</strong> request-local collectors overwrite the wrapped model's shared
        <code> config.fetch</code>; one gateway body can be empty while the other captures both prompts,
        and callers receive missing or crossed output.
      </p>
      <button disabled={running} onClick={trigger} style={{ padding: "0.6rem 1rem" }}>
        {running ? "Running…" : "Trigger bug"}
      </button>
      <pre style={{ marginTop: 16, padding: 16, background: "#111", color: "#eee", minHeight: 180, whiteSpace: "pre-wrap" }}>
        {log.join("\n")}
      </pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
