import { createHash, createOpaqueToken, timingSafeEqual } from "../../shared/crypto";
import { createLicenseKey, formatLicenseKey, normalizeLicenseKey, normalizeMachineId } from "./license-key";

const APP_ID_PATTERN = /^[a-z0-9-]{3,64}$/u;
const LICENSE_TOKEN_PREFIX = "tml_";

interface LicenseRow {
	id: string;
	application_id: string;
	app_id: string;
	application_name: string;
	status: "AVAILABLE" | "ACTIVE" | "REVOKED";
	machine_hash: string | null;
	machine_label: string | null;
	activation_token_hash: string | null;
	issued_at: string;
	activated_at: string | null;
	last_validated_at: string | null;
}

export interface LicenseActivation {
	status: "ACTIVE";
	licenseToken: string;
	licenseId: string;
	appId: string;
	activatedAt: string;
	machineLimit: 1;
}

export interface LicensedApplicationSummary {
	id: string;
	appId: string;
	name: string;
	status: "ACTIVE" | "DISABLED";
	createdAt: string;
}

export interface DesktopLicenseSummary {
	id: string;
	appId: string;
	applicationName: string;
	lastFour: string;
	status: "AVAILABLE" | "ACTIVE" | "REVOKED";
	machineLabel: string | null;
	issuedAt: string;
	activatedAt: string | null;
	lastValidatedAt: string | null;
	revokedAt: string | null;
}

export class LicenseRequestError extends Error {
	constructor(public readonly code: string, message: string, public readonly status: 400 | 401 | 404 | 409 | 429) {
		super(message);
	}
}

export class LicenseService {
	constructor(private readonly env: Env) {}

	async adminSnapshot(): Promise<{ applications: LicensedApplicationSummary[]; licenses: DesktopLicenseSummary[] }> {
		const [applications, licenses] = await Promise.all([
			this.env.tm_secure_db.prepare("SELECT id, app_id AS appId, name, status, created_at AS createdAt FROM licensed_applications ORDER BY created_at DESC").all<LicensedApplicationSummary>(),
			this.env.tm_secure_db.prepare("SELECT l.id, a.app_id AS appId, a.name AS applicationName, l.license_key_last_four AS lastFour, l.status, l.machine_label AS machineLabel, l.issued_at AS issuedAt, l.activated_at AS activatedAt, l.last_validated_at AS lastValidatedAt, l.revoked_at AS revokedAt FROM desktop_licenses l JOIN licensed_applications a ON a.id = l.application_id ORDER BY l.issued_at DESC").all<DesktopLicenseSummary>(),
		]);
		return { applications: applications.results, licenses: licenses.results };
	}

	async registerApplication(adminId: string, appId: string, name: string): Promise<void> {
		const normalizedAppId = normalizeAppId(appId);
		const normalizedName = normalizeName(name);
		const now = new Date().toISOString();
		try {
			await this.env.tm_secure_db.prepare("INSERT INTO licensed_applications (id, app_id, name, status, created_by, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)")
				.bind(crypto.randomUUID(), normalizedAppId, normalizedName, adminId, now, now).run();
		} catch (error) {
			if (isUniqueConstraint(error)) throw new LicenseRequestError("APP_ID_EXISTS", "This desktop application ID already exists.", 409);
			throw error;
		}
	}

	async issue(adminId: string, applicationId: string): Promise<{ licenseKey: string; licenseId: string }> {
		const application = await this.env.tm_secure_db.prepare("SELECT id FROM licensed_applications WHERE id = ? AND status = 'ACTIVE'").bind(applicationId).first<{ id: string }>();
		if (!application) throw new LicenseRequestError("APPLICATION_NOT_FOUND", "Select an active desktop application.", 404);

		for (let attempt = 0; attempt < 5; attempt += 1) {
			const licenseKey = createLicenseKey();
			const licenseId = crypto.randomUUID();
			const now = new Date().toISOString();
			try {
				await this.env.tm_secure_db.prepare("INSERT INTO desktop_licenses (id, application_id, license_key_hash, license_key_last_four, status, issued_by, issued_at, updated_at) VALUES (?, ?, ?, ?, 'AVAILABLE', ?, ?, ?)")
					.bind(licenseId, application.id, await this.hashLicenseKey(licenseKey), licenseKey.slice(-4), adminId, now, now).run();
				return { licenseKey: formatLicenseKey(licenseKey), licenseId };
			} catch (error) {
				if (!isUniqueConstraint(error)) throw error;
			}
		}
		throw new Error("A unique license key could not be generated.");
	}

	async revoke(licenseId: string): Promise<void> {
		const now = new Date().toISOString();
		const result = await this.env.tm_secure_db.prepare("UPDATE desktop_licenses SET status = 'REVOKED', revoked_at = ?, updated_at = ? WHERE id = ? AND status != 'REVOKED'")
			.bind(now, now, licenseId).run();
		if ((result.meta.changes ?? 0) !== 1) throw new LicenseRequestError("LICENSE_NOT_FOUND", "The license was not found or is already revoked.", 404);
	}

	async reset(licenseId: string): Promise<void> {
		const now = new Date().toISOString();
		const result = await this.env.tm_secure_db.prepare("UPDATE desktop_licenses SET status = 'AVAILABLE', machine_hash = NULL, machine_label = NULL, activation_token_hash = NULL, activated_at = NULL, last_validated_at = NULL, revoked_at = NULL, updated_at = ? WHERE id = ?")
			.bind(now, licenseId).run();
		if ((result.meta.changes ?? 0) !== 1) throw new LicenseRequestError("LICENSE_NOT_FOUND", "The license was not found.", 404);
	}

	async activate(input: { appId: string; licenseKey: string; machineId: string; machineLabel?: string }, request: Request): Promise<LicenseActivation> {
		await this.enforceRateLimit(request);
		const appId = normalizeAppId(input.appId);
		const licenseKey = normalizeLicenseKey(input.licenseKey);
		const machineId = normalizeMachineId(input.machineId);
		const machineHash = await this.hashMachine(machineId);
		let license = await this.findByKey(appId, licenseKey);
		if (!license) {
			await this.recordEvent(null, null, "ACTIVATION_REJECTED", machineHash, request, { appId, reason: "INVALID_LICENSE" });
			throw new LicenseRequestError("INVALID_LICENSE", "The license key is invalid.", 404);
		}
		if (license.status === "REVOKED") throw new LicenseRequestError("LICENSE_REVOKED", "The license key is revoked.", 401);
		if (license.status === "ACTIVE") return this.reactivate(license, machineHash, input.machineLabel, request);

		const activation = await this.activateAvailable(license, machineHash, input.machineLabel, request);
		if (activation) return activation;
		license = await this.findByKey(appId, licenseKey);
		if (!license) throw new LicenseRequestError("INVALID_LICENSE", "The license key is invalid.", 404);
		if (license.status === "REVOKED") throw new LicenseRequestError("LICENSE_REVOKED", "The license key is revoked.", 401);
		return this.reactivate(license, machineHash, input.machineLabel, request);
	}

	async validate(input: { appId: string; licenseToken: string; machineId: string }, request: Request): Promise<{ valid: true; status: "ACTIVE"; licenseId: string; appId: string; activatedAt: string }> {
		await this.enforceRateLimit(request);
		const appId = normalizeAppId(input.appId);
		const machineId = normalizeMachineId(input.machineId);
		if (!input.licenseToken.startsWith(LICENSE_TOKEN_PREFIX) || input.licenseToken.length > 128) throw new LicenseRequestError("INVALID_LICENSE", "The digital license is invalid.", 401);
		const tokenHash = await this.hashToken(input.licenseToken);
		const license = await this.env.tm_secure_db.prepare("SELECT l.id, l.application_id, a.app_id, a.name AS application_name, l.status, l.machine_hash, l.machine_label, l.activation_token_hash, l.issued_at, l.activated_at, l.last_validated_at FROM desktop_licenses l JOIN licensed_applications a ON a.id = l.application_id WHERE l.activation_token_hash = ? AND a.app_id = ? AND a.status = 'ACTIVE'")
			.bind(tokenHash, appId).first<LicenseRow>();
		const machineHash = await this.hashMachine(machineId);
		if (!license || license.status !== "ACTIVE" || !license.machine_hash || !timingSafeEqual(machineHash, license.machine_hash)) {
			await this.recordEvent(license?.application_id ?? null, license?.id ?? null, "VALIDATION_REJECTED", machineHash, request, { appId });
			throw new LicenseRequestError("INVALID_LICENSE", "The digital license is invalid for this machine.", 401);
		}

		const now = new Date().toISOString();
		await this.env.tm_secure_db.prepare("UPDATE desktop_licenses SET last_validated_at = ?, updated_at = ? WHERE id = ? AND status = 'ACTIVE'").bind(now, now, license.id).run();
		await this.recordEvent(license.application_id, license.id, "LICENSE_VALIDATED", machineHash, request, { appId });
		return { valid: true, status: "ACTIVE", licenseId: license.id, appId, activatedAt: license.activated_at ?? now };
	}

	private async activateAvailable(license: LicenseRow, machineHash: string, machineLabel: string | undefined, request: Request): Promise<LicenseActivation | null> {
		const token = `${LICENSE_TOKEN_PREFIX}${createOpaqueToken()}`;
		const now = new Date().toISOString();
		const result = await this.env.tm_secure_db.prepare("UPDATE desktop_licenses SET status = 'ACTIVE', machine_hash = ?, machine_label = ?, activation_token_hash = ?, activated_at = ?, last_validated_at = ?, updated_at = ? WHERE id = ? AND status = 'AVAILABLE' AND machine_hash IS NULL")
			.bind(machineHash, normalizeMachineLabel(machineLabel), await this.hashToken(token), now, now, now, license.id).run();
		if ((result.meta.changes ?? 0) !== 1) return null;
		await this.recordEvent(license.application_id, license.id, "LICENSE_ACTIVATED", machineHash, request, { appId: license.app_id });
		return activationResponse(license, token, now);
	}

	private async reactivate(license: LicenseRow, machineHash: string, machineLabel: string | undefined, request: Request): Promise<LicenseActivation> {
		if (license.status !== "ACTIVE" || !license.machine_hash || !timingSafeEqual(machineHash, license.machine_hash)) {
			await this.recordEvent(license.application_id, license.id, "DUPLICATE_MACHINE_REJECTED", machineHash, request, { appId: license.app_id });
			throw new LicenseRequestError("DUPLICATE_MACHINE", "This license key is already active on another machine.", 409);
		}
		const token = `${LICENSE_TOKEN_PREFIX}${createOpaqueToken()}`;
		const now = new Date().toISOString();
		if (!license.activation_token_hash) throw new LicenseRequestError("LICENSE_STATE_CHANGED", "The license state changed. Try activation again.", 409);
		const result = await this.env.tm_secure_db.prepare("UPDATE desktop_licenses SET activation_token_hash = ?, machine_label = COALESCE(?, machine_label), last_validated_at = ?, updated_at = ? WHERE id = ? AND status = 'ACTIVE' AND machine_hash = ? AND activation_token_hash = ?")
			.bind(await this.hashToken(token), normalizeMachineLabel(machineLabel), now, now, license.id, machineHash, license.activation_token_hash).run();
		if ((result.meta.changes ?? 0) !== 1) throw new LicenseRequestError("LICENSE_STATE_CHANGED", "The license state changed. Try activation again.", 409);
		await this.recordEvent(license.application_id, license.id, "LICENSE_REISSUED", machineHash, request, { appId: license.app_id });
		return activationResponse(license, token, license.activated_at ?? now);
	}

	private async findByKey(appId: string, licenseKey: string): Promise<LicenseRow | null> {
		return this.env.tm_secure_db.prepare("SELECT l.id, l.application_id, a.app_id, a.name AS application_name, l.status, l.machine_hash, l.machine_label, l.activation_token_hash, l.issued_at, l.activated_at, l.last_validated_at FROM desktop_licenses l JOIN licensed_applications a ON a.id = l.application_id WHERE l.license_key_hash = ? AND a.app_id = ? AND a.status = 'ACTIVE'")
			.bind(await this.hashLicenseKey(licenseKey), appId).first<LicenseRow>();
	}

	private async recordEvent(applicationId: string | null, licenseId: string | null, eventType: string, machineHash: string | null, request: Request, details: object): Promise<void> {
		const ipHash = await this.hashIp(request);
		await this.env.tm_secure_db.prepare("INSERT INTO license_events (id, application_id, license_id, event_type, machine_hash, ip_hash, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
			.bind(crypto.randomUUID(), applicationId, licenseId, eventType, machineHash, ipHash, JSON.stringify(details), new Date().toISOString()).run();
	}

	private async enforceRateLimit(request: Request): Promise<void> {
		const ipHash = await this.hashIp(request);
		const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
		const result = await this.env.tm_secure_db.prepare("SELECT COUNT(*) AS value FROM license_events WHERE ip_hash = ? AND created_at >= ? AND event_type IN ('ACTIVATION_REJECTED', 'VALIDATION_REJECTED', 'DUPLICATE_MACHINE_REJECTED')")
			.bind(ipHash, since).first<{ value: number }>();
		if (Number(result?.value ?? 0) >= 20) throw new LicenseRequestError("RATE_LIMITED", "Too many license attempts. Try again later.", 429);
	}

	private hashLicenseKey(value: string): Promise<string> { return createHash(this.env.OTP_HMAC_KEY, `license-key:${value}`); }
	private hashMachine(value: string): Promise<string> { return createHash(this.env.OTP_HMAC_KEY, `license-machine:${value}`); }
	private hashToken(value: string): Promise<string> { return createHash(this.env.OTP_HMAC_KEY, `license-token:${value}`); }
	private hashIp(request: Request): Promise<string> { return createHash(this.env.OTP_HMAC_KEY, `license-ip:${request.headers.get("cf-connecting-ip") ?? "unknown"}`); }
}

function activationResponse(license: LicenseRow, licenseToken: string, activatedAt: string): LicenseActivation {
	return { status: "ACTIVE", licenseToken, licenseId: license.id, appId: license.app_id, activatedAt, machineLimit: 1 };
}

function normalizeAppId(value: string): string {
	const normalized = value.trim().toLowerCase();
	if (!APP_ID_PATTERN.test(normalized)) throw new LicenseRequestError("INVALID_APP_ID", "Enter a valid desktop application ID.", 400);
	return normalized;
}

function normalizeName(value: string): string {
	const normalized = value.trim();
	if (normalized.length < 2 || normalized.length > 120) throw new LicenseRequestError("INVALID_NAME", "Enter a desktop application name.", 400);
	return normalized;
}

function normalizeMachineLabel(value: string | undefined): string | null {
	const normalized = value?.trim();
	return normalized ? normalized.slice(0, 120) : null;
}

function isUniqueConstraint(error: unknown): boolean {
	return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
