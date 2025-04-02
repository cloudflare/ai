export type KeyResult = {
    id: string;
    text: string;
    attainment: number;
}

export type Objective = {
    id: string;
    objectiveText: string;
    keyResults: KeyResult[];
}

export type Permissions = {
    objective: 'create' | 'read' | 'update' | 'delete';
    key_result: 'create' | 'read' | 'update' | 'delete';
};

// Context from the auth process, extracted from the Stytch auth token JWT
// and provided to the MCP Server as this.props
type AuthenticationContext = {
    organizationID: string;
    accessToken: string;
}
