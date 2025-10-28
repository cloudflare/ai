// Constants
const PKCE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
const RECOMMENDED_CODE_VERIFIER_LENGTH = 96;

function base64urlEncode(value: string): string {
	let base64 = btoa(value);
	base64 = base64.replace(/\+/g, '-');
	base64 = base64.replace(/\//g, '_');
	base64 = base64.replace(/=/g, '');
	return base64;
}

interface PKCECodes {
	codeChallenge: string;
	codeVerifier: string;
}

export async function verifyPKCE(codeVerifier: string, codeChallenge: string): Promise<boolean> {
	const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
	const hash = new Uint8Array(buffer);
	let binary = '';
	const hashLength = hash.byteLength;
	for (let i = 0; i < hashLength; i++) {
		binary += String.fromCharCode(hash[i]);
	}
	const generatedChallenge = base64urlEncode(binary);
	return generatedChallenge === codeChallenge;
}

export async function generatePKCECodes(): Promise<PKCECodes> {
	const output = new Uint32Array(RECOMMENDED_CODE_VERIFIER_LENGTH);
	crypto.getRandomValues(output);
	const codeVerifier = base64urlEncode(
		Array.from(output)
			.map((num: number) => PKCE_CHARSET[num % PKCE_CHARSET.length])
			.join(''),
	);
	const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
	const hash = new Uint8Array(buffer);
	let binary = '';
	const hashLength = hash.byteLength;
	for (let i = 0; i < hashLength; i++) {
		binary += String.fromCharCode(hash[i]);
	}
	const codeChallenge = base64urlEncode(binary); //btoa(binary);
	return { codeChallenge, codeVerifier };
}
