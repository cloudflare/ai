import LogtoClient, { LogtoConfig } from "@logto/node";
import { createSessionStorage } from "./storage";

export class LogtoHonoClient {
	private redirectResponse: Response;
	private nodeClient: LogtoClient;

	constructor(private logtoConfig: LogtoConfig, sessionId: string) {
		this.redirectResponse = new Response(null, { status: 302 });

		this.nodeClient = new LogtoClient(this.logtoConfig, {
			navigate: (url) => {
				this.redirectResponse.headers.set("location", url);
			},
			storage: createSessionStorage(sessionId),
		});
	}

	async handleSignIn(callbackUrl: string) {
		await this.nodeClient.signIn(callbackUrl);

		return this.redirectResponse;
	}

	async handleSignInCallback(redirectUrl: string) {
		await this.nodeClient.handleSignInCallback(redirectUrl);
	}

	async getIdTokenClaims() {
		return this.nodeClient.getIdTokenClaims();
	}
}
