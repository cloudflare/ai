declare namespace Cloudflare {
	export interface Env {
		AI: Ai;
		CLOUDFLARE_API_TOKEN: string;
		CLOUDFLARE_ACCOUNT_ID: string;
	}
}

interface Env extends Cloudflare.Env {}
