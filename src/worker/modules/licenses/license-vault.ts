const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ADDITIONAL_DATA = encoder.encode("tm-secure:desktop-license:v1");

export interface EncryptedLicenseKey {
	ciphertext: string;
	iv: string;
}

export async function encryptLicenseKey(secret: string, licenseKey: string): Promise<EncryptedLicenseKey> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv, additionalData: ADDITIONAL_DATA },
		await importVaultKey(secret),
		encoder.encode(licenseKey),
	);
	return { ciphertext: toBase64Url(new Uint8Array(ciphertext)), iv: toBase64Url(iv) };
}

export async function decryptLicenseKey(secret: string, encrypted: EncryptedLicenseKey): Promise<string> {
	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: fromBase64Url(encrypted.iv), additionalData: ADDITIONAL_DATA },
		await importVaultKey(secret),
		fromBase64Url(encrypted.ciphertext),
	);
	return decoder.decode(plaintext);
}

async function importVaultKey(secret: string): Promise<CryptoKey> {
	const material = await crypto.subtle.digest("SHA-256", encoder.encode(`license-vault:v1:${secret}`));
	return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
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
