import { z } from "zod";
import type { MyMCP } from "../index";

const AccountSchema = z.object({
	id: z.string(),
	name: z.string(),
	created_on: z.string(),
});
type AccountsListResponseSchema = z.infer<typeof AccountsListResponseSchema>;
const AccountsListResponseSchema = z.object({
	result: z.array(AccountSchema),
	success: z.boolean(),
	errors: z.array(z.any()),
	messages: z.array(z.any()),
});

export async function handleAccountsList({
	apiToken,
}: {
	apiToken: string;
}): Promise<AccountsListResponseSchema["result"]> {
	// Currently limited to 50 accounts
	const response = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=50", {
		method: "GET",
		headers: {
			Authorization: `Bearer ${apiToken}`,
			Accept: "application/javascript",
		},
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Cloudflare API request failed: ${error}`);
	}

	return AccountsListResponseSchema.parse(await response.json()).result;
}

export function registerAccountTools(agent: MyMCP) {
	// Tool to list all accounts
	agent.server.tool(
		"accounts_list",
		"List all accounts in your Cloudflare account",
		{},
		async () => {
			try {
				const results = await handleAccountsList({ apiToken: agent.props.accessToken });
				// Sort accounts by created_on date (newest first)
				const accounts = results
					// order by created_on desc ( newest first )
					.sort((a, b) => {
						if (!a.created_on) return 1;
						if (!b.created_on) return -1;
						return new Date(b.created_on).getTime() - new Date(a.created_on).getTime();
					});

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								accounts,
								count: accounts.length,
							}),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing accounts: ${error instanceof Error && error.message}`,
						},
					],
				};
			}
		},
	);

	const activeAccountIdParam = z
		.string()
		.describe(
			"The accountId present in the users Cloudflare account, that should be the active accountId.",
		);
	agent.server.tool(
		"set_active_account",
		"Set active account to be used for tool calls that require accountId",
		{
			activeAccountIdParam,
		},
		async (params) => {
			try {
				const { activeAccountIdParam: activeAccountId } = params;
				agent.setActiveAccountId(activeAccountId);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								activeAccountId,
							}),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error setting activeAccountID: ${error instanceof Error && error.message}`,
						},
					],
				};
			}
		},
	);
}
