import { createHash, createOpaqueToken, derivePassword, timingSafeEqual } from "../../shared/crypto";

const ADMIN_SESSION_DAYS = 1;
const PASSWORD_ITERATIONS = 100_000;

export interface AdminPrincipal {
	id: string;
	email: string;
	displayName: string;
	role: string;
	mustChangePassword: boolean;
}

interface AdminAccountRow {
	id: string;
	email: string;
	display_name: string;
	role: string;
	password_salt: string;
	password_hash: string;
	password_iterations: number;
	must_change_password: number;
	status: string;
}

export class AdminAuthService {
	constructor(private readonly env: Env) {}

	async login(email: string, password: string, request: Request): Promise<{ principal: AdminPrincipal; token: string }> {
		const account = await this.env.tm_secure_db.prepare("SELECT * FROM admin_accounts WHERE email = ?").bind(email.trim().toLowerCase()).first<AdminAccountRow>();
		if (!account || account.status !== "ACTIVE") throw new Error("Invalid administrator credentials.");
		const candidate = await derivePassword(password, account.password_salt, account.password_iterations);
		if (!timingSafeEqual(candidate, account.password_hash)) throw new Error("Invalid administrator credentials.");
		const token = createOpaqueToken();
		const now = new Date();
		await this.env.tm_secure_db.batch([
			this.env.tm_secure_db.prepare("INSERT INTO admin_sessions (id, admin_id, session_hash, ip_hash, user_agent, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), account.id, await createHash(this.env.OTP_HMAC_KEY, token), await this.hashIp(request), request.headers.get("user-agent")?.slice(0, 300) ?? null, now.toISOString(), now.toISOString(), new Date(now.getTime() + ADMIN_SESSION_DAYS * 86_400_000).toISOString()),
			this.env.tm_secure_db.prepare("UPDATE admin_accounts SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now.toISOString(), now.toISOString(), account.id),
		]);
		await this.audit(account.id, "ADMIN_LOGIN", request, {});
		return { principal: toPrincipal(account), token };
	}

	async authenticate(token: string | undefined): Promise<AdminPrincipal | null> {
		if (!token) return null;
		return this.env.tm_secure_db.prepare("SELECT a.id, a.email, a.display_name AS displayName, a.role, a.must_change_password AS mustChangePassword FROM admin_sessions s JOIN admin_accounts a ON a.id = s.admin_id WHERE s.session_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND a.status = 'ACTIVE'").bind(await createHash(this.env.OTP_HMAC_KEY, token), new Date().toISOString()).first<AdminPrincipal>();
	}

	async changePassword(adminId: string, currentPassword: string, nextPassword: string, request: Request): Promise<void> {
		if (nextPassword.length < 12 || !/[A-Z]/u.test(nextPassword) || !/[a-z]/u.test(nextPassword) || !/\d/u.test(nextPassword) || !/[^A-Za-z0-9]/u.test(nextPassword)) throw new Error("Use at least 12 characters with upper, lower, number, and symbol.");
		const account = await this.env.tm_secure_db.prepare("SELECT * FROM admin_accounts WHERE id = ?").bind(adminId).first<AdminAccountRow>();
		if (!account) throw new Error("Administrator account was not found.");
		const current = await derivePassword(currentPassword, account.password_salt, account.password_iterations);
		if (!timingSafeEqual(current, account.password_hash)) throw new Error("The current password is incorrect.");
		const salt = createOpaqueToken(16);
		const hash = await derivePassword(nextPassword, salt, PASSWORD_ITERATIONS);
		await this.env.tm_secure_db.prepare("UPDATE admin_accounts SET password_salt = ?, password_hash = ?, password_iterations = ?, must_change_password = 0, updated_at = ? WHERE id = ?").bind(salt, hash, PASSWORD_ITERATIONS, new Date().toISOString(), adminId).run();
		await this.audit(adminId, "ADMIN_PASSWORD_CHANGED", request, {});
	}

	async logout(token: string | undefined): Promise<void> {
		if (!token) return;
		await this.env.tm_secure_db.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE session_hash = ? AND revoked_at IS NULL").bind(new Date().toISOString(), await createHash(this.env.OTP_HMAC_KEY, token)).run();
	}

	async audit(adminId: string, eventType: string, request: Request, details: object): Promise<void> {
		await this.env.tm_secure_db.prepare("INSERT INTO audit_events (id, event_type, actor_type, actor_id, ip_hash, details_json, created_at) VALUES (?, ?, 'ADMIN', ?, ?, ?, ?)").bind(crypto.randomUUID(), eventType, adminId, await this.hashIp(request), JSON.stringify(details), new Date().toISOString()).run();
	}

	private async hashIp(request: Request): Promise<string> {
		return createHash(this.env.OTP_HMAC_KEY, request.headers.get("cf-connecting-ip") ?? "unknown");
	}
}

function toPrincipal(account: AdminAccountRow): AdminPrincipal {
	return { id: account.id, email: account.email, displayName: account.display_name, role: account.role, mustChangePassword: account.must_change_password === 1 };
}
