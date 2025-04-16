/*
 * Helpers for converting to and from URL safe Base64 strings. Needed for JWT encoding.
 */
const base64url = {
    stringify: function (a: string) {
        // @ts-ignore
        let base64string = btoa(String.fromCharCode.apply(0, a))
        return base64string.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    },
    parse: function (s: string) {
        s = s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
        return new Uint8Array(
            // @ts-ignore
            Array.prototype.map.call(atob(s), function (c) {
                return c.charCodeAt(0)
            }),
        )
    },
}

/*
 * Helper to get from an ascii string to a literal byte array.
 * Necessary to get ascii string prepped for base 64 encoding
 */
function asciiToUint8Array(str: string) {
    let chars = []
    for (let i = 0; i < str.length; ++i) {
        chars.push(str.charCodeAt(i))
    }
    return new Uint8Array(chars)
}

/**
 * Helper to get the Access public keys from the certs endpoint
 * @param {*} env
 * @param {*} kid - The key id that signed the token
 */
async function fetchAccessPublicKey(env: Env, kid: string) {
    if (!env.ACCESS_JWKS_URL) {
        throw new Error('access jwks url not provided')
    }
    const resp = await fetch(env.ACCESS_JWKS_URL)
    const keys = (await resp.json()) as any
    const jwk = keys.keys.filter((key: any) => key.kid == kid)[0]
    const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-256',
        },
        false,
        ['verify'],
    )
    return key
}

/**
 * Parse a JWT into its respective pieces. Does not do any validation other than form checking.
 */
function parseJWT(token: string) {
    const tokenParts = token.split('.')

    if (tokenParts.length !== 3) {
        throw new Error('token must have 3 parts')
    }

    let enc = new TextDecoder('utf-8')
    return {
        to_be_validated: `${tokenParts[0]}.${tokenParts[1]}`,
        header: JSON.parse(enc.decode(base64url.parse(tokenParts[0]))),
        payload: JSON.parse(enc.decode(base64url.parse(tokenParts[1]))),
        signature: tokenParts[2],
    }
}

/**
 * Validates the provided token using the Access public key set
 */
export async function verifyToken(env: Env, token: string) {
    const jwt = parseJWT(token)
    const key = await fetchAccessPublicKey(env, jwt.header.kid)

    const verified = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        base64url.parse(jwt.signature),
        asciiToUint8Array(jwt.to_be_validated),
    )

    if (!verified) {
        throw new Error('failed to verify token')
    }

    const claims = jwt.payload
    let now = Math.floor(Date.now() / 1000)
    // Validate expiration
    if (claims.exp < now) {
        throw new Error('expired token')
    }

    return claims
}
