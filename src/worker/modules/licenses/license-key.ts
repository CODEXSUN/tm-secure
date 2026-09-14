const LICENSE_DIGITS = 16;
const RANDOM_ACCEPT_LIMIT = 250;

export function createLicenseKey(): string {
	let value = "";
	while (value.length < LICENSE_DIGITS) {
		const bytes = crypto.getRandomValues(new Uint8Array(LICENSE_DIGITS));
		for (const byte of bytes) {
			if (byte >= RANDOM_ACCEPT_LIMIT) continue;
			value += String(byte % 10);
			if (value.length === LICENSE_DIGITS) break;
		}
	}
	return value;
}

export function normalizeLicenseKey(value: string): string {
	if (!/^[0-9 -]+$/u.test(value)) throw new Error("Enter a valid 16-digit license key.");
	const digits = value.replace(/[^0-9]/gu, "");
	if (digits.length !== LICENSE_DIGITS) throw new Error("Enter a valid 16-digit license key.");
	return digits;
}

export function formatLicenseKey(value: string): string {
	return normalizeLicenseKey(value).match(/.{1,4}/gu)?.join("-") ?? value;
}

export function normalizeMachineId(value: string): string {
	const normalized = value.trim();
	if (!/^[A-Za-z0-9._:-]{8,128}$/u.test(normalized)) throw new Error("Enter a valid installation ID.");
	return normalized;
}
