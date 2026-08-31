export type IdentifierType = "EMAIL" | "MOBILE" | "USERNAME";

export function normalizeEmail(value: string): string {
	const normalized = value.trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
		throw new Error("Enter a valid email address.");
	}
	return normalized;
}

export function normalizeMobile(value: string): string {
	const compact = value.replace(/[\s()-]/gu, "").replace(/^\+91/u, "");
	if (!/^[6-9]\d{9}$/u.test(compact)) {
		throw new Error("Enter a valid 10-digit Indian mobile number.");
	}
	return `+91${compact}`;
}

export function normalizeUsername(value: string): string {
	const normalized = value.trim().toLowerCase();
	if (!/^[a-z][a-z0-9._-]{2,31}$/u.test(normalized)) {
		throw new Error("Use 3–32 letters, numbers, dots, dashes, or underscores.");
	}
	return normalized;
}

export function identify(value: string): { type: IdentifierType; value: string } {
	if (value.includes("@")) return { type: "EMAIL", value: normalizeEmail(value) };
	if (/^[+\d\s()-]+$/u.test(value)) return { type: "MOBILE", value: normalizeMobile(value) };
	return { type: "USERNAME", value: normalizeUsername(value) };
}
