import { onMcpAuthorization } from "use-mcp";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function OAuthCallbackPage() {
	const [searchParams] = useSearchParams();
	const [result, setResult] = useState<{
		status: "processing" | "success" | "error";
		message?: string;
	}>({ status: "processing" });

	useEffect(() => {
		const query: Record<string, string> = {};
		searchParams.forEach((value, key) => {
			query[key] = value;
		});

		// @ts-expect-error need to fix this
		onMcpAuthorization(query)
			.then((res) =>
				setResult({
					// @ts-expect-error need to fix this
					status: res.success ? "success" : "error",
					// @ts-expect-error need to fix this
					message: res.error,
				}),
			)
			.catch((err: Error) => setResult({ status: "error", message: err.message }));
	}, [searchParams]);

	return (
		<div>
			<h1>Authentication {result.status}</h1>
			{result.status === "processing" && <p>Processing authentication...</p>}
			{result.status === "success" && (
				<p>Authentication successful! You can close this window.</p>
			)}
			{result.status === "error" && <p>Authentication error: {result.message}</p>}
		</div>
	);
}
