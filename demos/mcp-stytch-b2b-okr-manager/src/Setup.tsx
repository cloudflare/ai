import type { ReactNode } from "react";

export default function Setup({ children }: { children: ReactNode }) {
	if (!import.meta.env.VITE_STYTCH_PUBLIC_TOKEN) {
		return (
			<>
				<h1>Error: Stytch Not Configured Yet</h1>
				<p>
					Full setup instructions are available in the{" "}
					<a href="https://github.com/stytchauth/mcp-stytch-b2b-okr-manager">README</a>.
					Make sure you have configured the following:
					<ul>
						<li>
							<code>VITE_STYTCH_PUBLIC_TOKEN</code> in your <code>.env.local</code>
						</li>
						<li>
							<code>STYTCH_PROJECT_ID</code> in your <code>.dev.vars</code>
						</li>
						<li>
							<code>STYTCH_PROJECT_SECRET</code> in your <code>.dev.vars</code>
						</li>
					</ul>
				</p>
			</>
		);
	}

	return children;
}
