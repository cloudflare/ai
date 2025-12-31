export type Todo = {
    id: string;
    text: string;
    completed: boolean;
}

// Context from the auth process, extracted from the Scalekit auth token JWT
// and provided to the MCP Server as this.props
type AuthenticationContext = {
    claims: {
        "iss": string,
        "scope"?: string,
        "sub": string,
        "aud": string | string[],
        "client_id"?: string,
        "exp": number,
        "iat": number,
        "nbf"?: number,
        "jti"?: string,
        "email"?: string,
        [key: string]: any,
    },
    accessToken: string
}
