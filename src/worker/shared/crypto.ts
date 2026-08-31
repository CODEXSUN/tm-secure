const encoder = new TextEncoder();

export function createOpaqueToken(byteLength = 32): string {
	const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
	return toBase64Url(bytes);
}

export function createOtp(): string {
	const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
	return String(value % 1_000_000).padStart(6, "0");
}

export async function createHash(secret: string, value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
	return toBase64Url(new Uint8Array(signature));
}

export async function derivePassword(password: string, salt: string, iterations: number): Promise<string> {
	const passwordKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(salt), iterations },
		passwordKey,
		256,
	);
	return toBase64Url(new Uint8Array(bits));
}

export function timingSafeEqual(left: string, right: string): boolean {
	const leftBytes = encoder.encode(left);
	const rightBytes = encoder.encode(right);
	if (leftBytes.byteLength !== rightBytes.byteLength) return false;
	let difference = 0;
	for (let index = 0; index < leftBytes.byteLength; index += 1) {
		difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
	}
	return difference === 0;
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
	const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(base64);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
