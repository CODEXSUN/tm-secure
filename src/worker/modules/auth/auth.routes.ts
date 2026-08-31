import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createHash, createOpaqueToken } from "../../shared/crypto";
import { identify, normalizeEmail, normalizeMobile, normalizeUsername } from "../../shared/identifiers";
import { ManualOtpService } from "./manual-otp.service";

const SESSION_COOKIE = "tm_secure_session";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

interface IdentifierRow {
	user_id: string;
	email: string | null;
}

interface UserRow { user_id: string; status: string; }

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post("/enrollment/request", async (c) => {
	const body = await c.req.json<{ mobile?: string; email?: string; username?: string }>();
	try {
		const mobile = normalizeMobile(body.mobile ?? "");
		const email = normalizeEmail(body.email ?? "");
		const username = normalizeUsername(body.username ?? "");
		const existing = await findUser(c.env.tm_secure_db, "MOBILE", mobile);
		if (existing) return c.json({ error: "Use the sign-in form for this account." }, 409);

		const now = new Date().toISOString();
		const userId = crypto.randomUUID();
		const profileId = crypto.randomUUID();
		await c.env.tm_secure_db.batch([
			c.env.tm_secure_db.prepare("INSERT INTO users (id, status, created_at, updated_at) VALUES (?, 'PENDING_ADMIN_APPROVAL', ?, ?)").bind(userId, now, now),
			c.env.tm_secure_db.prepare("INSERT INTO user_identifiers (id, user_id, type, normalized_value, display_value, verification_status, created_at) VALUES (?, ?, 'MOBILE', ?, ?, 'PENDING', ?)").bind(crypto.randomUUID(), userId, mobile, mobile, now),
			c.env.tm_secure_db.prepare("INSERT INTO user_identifiers (id, user_id, type, normalized_value, display_value, verification_status, created_at) VALUES (?, ?, 'EMAIL', ?, ?, 'PENDING', ?)").bind(crypto.randomUUID(), userId, email, email, now),
			c.env.tm_secure_db.prepare("INSERT INTO user_identifiers (id, user_id, type, normalized_value, display_value, verification_status, created_at) VALUES (?, ?, 'USERNAME', ?, ?, 'VERIFIED', ?)").bind(crypto.randomUUID(), userId, username, username, now),
			c.env.tm_secure_db.prepare("INSERT INTO business_profiles (id, user_id, approval_status, created_at, updated_at) VALUES (?, ?, 'PENDING', ?, ?)").bind(profileId, userId, now, now),
		]);
		await audit(c.env, c.req.raw, userId, "ENROLLMENT_REQUESTED");
		return c.json({ pending: true }, 202);
	} catch (error) {
		return c.json({ error: getErrorMessage(error) }, 400);
	}
});

authRoutes.post("/otp/request", (c) => c.json(genericOtpResponse(), 202));

authRoutes.post("/otp/verify", async (c) => {
	const body = await c.req.json<{ identifier?: string; otp?: string }>();
	if (!/^\d{6}$/u.test(body.otp ?? "")) return c.json({ error: "Enter the six-digit code." }, 400);
	try {
		const identifier = identify(body.identifier ?? "");
		const user = await c.env.tm_secure_db.prepare("SELECT u.id AS user_id, u.status FROM users u JOIN user_identifiers i ON i.user_id = u.id WHERE i.type = ? AND i.normalized_value = ?").bind(identifier.type, identifier.value).first<UserRow>();
		if (!user || user.status !== "ACTIVE") throw new Error("This code is invalid or expired.");
		await new ManualOtpService(c.env).verify(user.user_id, body.otp ?? "");
		const now = new Date().toISOString();
		await c.env.tm_secure_db.prepare("UPDATE user_identifiers SET verification_status = 'VERIFIED', verified_at = ? WHERE user_id = ? AND type = 'MOBILE'").bind(now, user.user_id).run();
		const token = await createSession(c.env, c.req.raw, user.user_id, "ADMIN_OTP");
		setSessionCookie(c, token);
		await audit(c.env, c.req.raw, user.user_id, "MANUAL_OTP_VERIFIED");
		return c.json({ authenticated: true, approvalStatus: "APPROVED" });
	} catch (error) {
		return c.json({ error: getErrorMessage(error) }, 400);
	}
});

authRoutes.get("/development/status", (c) => c.json({ enabled: isDevelopmentBypassEnabled(c.env) }));

authRoutes.post("/development/login", async (c) => {
	if (!isDevelopmentBypassEnabled(c.env)) return c.json({ error: "Not found." }, 404);
	const userId = await ensureDevelopmentUser(c.env.tm_secure_db);
	const token = await createSession(c.env, c.req.raw, userId, "DEVELOPMENT_BYPASS");
	setSessionCookie(c, token);
	await audit(c.env, c.req.raw, userId, "DEVELOPMENT_LOGIN_BYPASSED");
	return c.json({ authenticated: true, approvalStatus: "APPROVED" });
});

authRoutes.get("/session", async (c) => {
	const token = getCookie(c, SESSION_COOKIE);
	if (!token) return c.json({ authenticated: false });
	const hash = await createHash(c.env.OTP_HMAC_KEY, token);
	const session = await c.env.tm_secure_db.prepare("SELECT u.id AS userId, u.status, bp.approval_status AS approvalStatus FROM auth_sessions s JOIN users u ON u.id = s.user_id JOIN business_profiles bp ON bp.user_id = u.id WHERE s.session_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?").bind(hash, new Date().toISOString()).first();
	return c.json(session ? { authenticated: true, ...session } : { authenticated: false });
});

authRoutes.post("/logout", async (c) => {
	const token = getCookie(c, SESSION_COOKIE);
	if (token) {
		const hash = await createHash(c.env.OTP_HMAC_KEY, token);
		await c.env.tm_secure_db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE session_hash = ? AND revoked_at IS NULL").bind(new Date().toISOString(), hash).run();
	}
	deleteCookie(c, SESSION_COOKIE, { path: "/", secure: c.env.NODE_ENV !== "development" });
	return c.json({ authenticated: false });
});

async function createSession(env: Env, request: Request, userId: string, method: string): Promise<string> {
	const token = createOpaqueToken();
	const now = new Date().toISOString();
	await env.tm_secure_db.prepare("INSERT INTO auth_sessions (id, user_id, session_hash, authentication_method, ip_hash, user_agent, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
		.bind(crypto.randomUUID(), userId, await createHash(env.OTP_HMAC_KEY, token), method, await hashIp(env, request), request.headers.get("user-agent")?.slice(0, 300) ?? null, now, now, new Date(Date.now() + THIRTY_DAYS).toISOString()).run();
	return token;
}

async function ensureDevelopmentUser(database: D1Database): Promise<string> {
	const email = "developer@techmedia.local";
	const existing = await findUser(database, "EMAIL", email);
	if (existing) return existing.user_id;
	const now = new Date().toISOString();
	const userId = crypto.randomUUID();
	await database.batch([
		database.prepare("INSERT INTO users (id, status, created_at, updated_at) VALUES (?, 'ACTIVE', ?, ?)").bind(userId, now, now),
		database.prepare("INSERT INTO user_identifiers (id, user_id, type, normalized_value, display_value, verification_status, verified_at, created_at) VALUES (?, ?, 'MOBILE', '+919999999999', '+919999999999', 'VERIFIED', ?, ?)").bind(crypto.randomUUID(), userId, now, now),
		database.prepare("INSERT INTO user_identifiers (id, user_id, type, normalized_value, display_value, verification_status, verified_at, created_at) VALUES (?, ?, 'EMAIL', ?, ?, 'VERIFIED', ?, ?)").bind(crypto.randomUUID(), userId, email, email, now, now),
		database.prepare("INSERT INTO user_identifiers (id, user_id, type, normalized_value, display_value, verification_status, verified_at, created_at) VALUES (?, ?, 'USERNAME', 'developer', 'developer', 'VERIFIED', ?, ?)").bind(crypto.randomUUID(), userId, now, now),
		database.prepare("INSERT INTO business_profiles (id, user_id, approval_status, approved_at, created_at, updated_at) VALUES (?, ?, 'APPROVED', ?, ?, ?)").bind(crypto.randomUUID(), userId, now, now, now),
	]);
	return userId;
}

function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string): void {
	setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: c.env.NODE_ENV !== "development", sameSite: "Lax", path: "/", maxAge: THIRTY_DAYS / 1000 });
}

function isDevelopmentBypassEnabled(env: Env): boolean {
	return env.NODE_ENV === "development" && env.AUTH_BYPASS_ENABLED === "true";
}

async function findUser(database: D1Database, type: string, value: string): Promise<IdentifierRow | null> {
	return database.prepare("SELECT matched.user_id, email.normalized_value AS email FROM user_identifiers matched LEFT JOIN user_identifiers email ON email.user_id = matched.user_id AND email.type = 'EMAIL' AND email.verification_status = 'VERIFIED' WHERE matched.type = ? AND matched.normalized_value = ?").bind(type, value).first<IdentifierRow>();
}

async function audit(env: Env, request: Request, userId: string | null, eventType: string): Promise<void> {
	await env.tm_secure_db.prepare("INSERT INTO audit_events (id, user_id, event_type, actor_type, actor_id, ip_hash, created_at) VALUES (?, ?, ?, 'USER', ?, ?, ?)").bind(crypto.randomUUID(), userId, eventType, userId, await hashIp(env, request), new Date().toISOString()).run();
}

async function hashIp(env: Env, request: Request): Promise<string> {
	return createHash(env.OTP_HMAC_KEY, request.headers.get("cf-connecting-ip") ?? "unknown");
}

function genericOtpResponse() {
	return { accepted: true, message: "Ask your administrator for a verification code." };
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "The request could not be completed.";
}
