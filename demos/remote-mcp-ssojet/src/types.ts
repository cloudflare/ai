import type { JWTPayload } from "jose";

export type UserProps = {
	claims: JWTPayload;
	tokenSet: {
		accessToken: string;
		idToken: string;
		refreshToken: string;
	};
};
