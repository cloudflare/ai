import {ReactNode} from "react";


export default function Setup({children}: { children: ReactNode }) {
    const clientId = import.meta.env.VITE_SCALEKIT_CLIENT_ID;
    const envUrl = import.meta.env.VITE_SCALEKIT_ENVIRONMENT_URL;
    
    if (!clientId || !envUrl) {
        return (
            <>
                <h1>
                    Error: Scalekit Not Configured Yet
                </h1>
                <p>
                    Full setup instructions are available in the{' '}
                    <a href="https://github.com/cloudflare/ai/tree/main/demos/mcp-scalekit-todo-list">README</a>.
                    Make sure you have configured the following:
                    <ul>
                        <li><code>VITE_SCALEKIT_CLIENT_ID</code> in your <code>.env.local</code></li>
                        <li><code>VITE_SCALEKIT_ENVIRONMENT_URL</code> in your <code>.env.local</code></li>
                        <li><code>SCALEKIT_CLIENT_ID</code> in your <code>.dev.vars</code></li>
                        <li><code>SCALEKIT_CLIENT_SECRET</code> in your <code>.dev.vars</code></li>
                        <li><code>SCALEKIT_ENVIRONMENT_URL</code> in your <code>.dev.vars</code></li>
                    </ul>
                </p>
            </>
        )
    }

    return children;
}