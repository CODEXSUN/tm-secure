import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { EmailService } from "../email/email.service";
import { createHash, createOpaqueToken, createOtp, timingSafeEqual } from "../../shared/crypto";
import { identify, normalizeEmail, normalizeMobile, normalizeUsername } from "../../shared/identifiers";

const SESSION_COOKIE = "tm_secure_session";
const TEN_MINUTES = 10 * 60 * 1000;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

interface IdentifierRow {
	user_id: string;
	email: string | null;
}

interface ChallengeRow {
	id: string;
	user_id: string;
	otp_hash: string;
	attempts: number;
	max_attempts: number;
	expires_at: string;
	consumed_at: string | null;
	purpose: "ENROLLMENT" | "LOGIN" | "RECOVERY";
}

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post("/enrollment/request", async (c) => {
	const body = await c.req.json<{ mobile?: string; email?: string; username?: string }>();
	let createdUserId: string | null = null;
	try {
		const mobile = normalizeMobile(body.mobile ?? "");
		const email = normalizeEmail(body.email ?? "");
		const username = normalizeUsername(body.username ?? "");
		const existing = await findUser(c.env.tm_secure_db, "MOBILE", mobile);
		if (existing) return c.json({ error: "Use the sign-in form for this account." }, 409);

		const now = new Date().toISOString();
		const userId = crypto.randomUUID();
		createdUserId = userId;
		const profileId = crypto.randomUUID();
		await c.env.tm_secure_db.batch([
			c.env.tm_secure_db.prepare("INSERT INTO users (id, status, created_at, updated_at) VALUES (?, 'PENDING_ADMIN_APPROVAL', ?, ?)").bind(userId, now, now),
			c.env.tm_secure_db.prepare("INSERT INTO user_identifiers (id, user_id, type, normalized_value, display_value, verification_status, created_at) VALUES (?, ?, 'MOBILE', ?, ?, 'PENDING', ?)").bind(crypto.randomUUID(), userId, mobile, mobile, now),
			c.env.tm_secure_db.prepare("INSERT INTO user_identifiers (id, user_id, type, normalized_value, display_value, verification_status, created_at) VALUES (?, ?, 'EMAIL', ?, ?, 'PENDING', ?)").bind(crypto.randomUUID(), userId, email, email, now),
			c.env.tm_secure_db.prepare("INSERT INTO user_identifiers (id, user_id, type, normalized_value, display_value, verification_status, created_at) VALUES (?, ?, 'USERNAME', ?, ?, 'VERIFIED', ?)").bind(crypto.randomUUID(), userId, username, username, now),
			c.env.tm_secure_db.prepare("INSERT INTO business_profiles (id, user_id, approval_status, created_at, updated_at) VALUES (?, ?, 'PENDING', ?, ?)").bind(profileId, userId, now, now),
		]);
		const challengeId = await issueChallenge(c.env, userId, email, "ENROLLMENT");
		await audit(c.env, c.req.raw, userId, "ENROLLMENT_REQUESTED");
		return c.json({ challengeId, destination: maskEmail(email) }, 202);
	} catch (error) {
		if (createdUserId) {
			await c.env.tm_secure_db.prepare("DELETE FROM users WHERE id = ?").bind(createdUserId).run();
			return c.json({ error: "Email delivery is not available. Try again later." }, 503);
		}
		return c.json({ error: getErrorMessage(error) }, 400);
	}
});

authRoutes.post("/otp/request", async (c) => {
	const body = await c.req.json<{ identifier?: string }>();
	try {
		const identifier = identify(body.identifier ?? "");
		const user = await findUser(c.env.tm_secure_db, identifier.type, identifier.value);
		if (!user?.email) return c.json(genericOtpResponse(), 202);
		const challengeId = await issueChallenge(c.env, user.user_id, user.email, "LOGIN");
		await audit(c.env, c.req.raw, user.user_id, "LOGIN_OTP_REQUESTED");
		return c.json({ challengeId, destination: maskEmail(user.email) }, 202);
	} catch {
		return c.json(genericOtpResponse(), 202);
	}
});

authRoutes.post("/otp/verify", async (c) => {
	const body = await c.req.json<{ challengeId?: string; otp?: string }>();
	if (!body.challengeId || !/^\d{6}$/u.test(body.otp ?? "")) return c.json({ error: "Enter the six-digit code." }, 400);
	const challenge = await c.env.tm_secure_db.prepare("SELECT * FROM otp_challenges WHERE id = ?").bind(body.challengeId).first<ChallengeRow>();
	if (!challenge || challenge.consumed_at || challenge.attempts >= challenge.max_attempts || new Date(challenge.expires_at) <= new Date()) {
		return c.json({ error: "This code is invalid or expired." }, 400);
	}
	const candidate = await createHash(c.env.OTP_HMAC_KEY, `${challenge.id}:${body.otp}`);
	if (!timingSafeEqual(candidate, challenge.otp_hash)) {
		await c.env.tm_secure_db.prepare("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL").bind(challenge.id).run();
		return c.json({ error: "This code is invalid or expired." }, 400);
	}

	const token = await createSession(c.env, c.req.raw, challenge.user_id, "EMAIL_OTP");
	const now = new Date().toISOString();
	await c.env.tm_secure_db.batch([
		c.env.tm_secure_db.prepare("UPDATE otp_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(now, challenge.id),
		c.env.tm_secure_db.prepare("UPDATE user_identifiers SET verification_status = 'VERIFIED', verified_at = ? WHERE user_id = ? AND type = 'EMAIL'").bind(now, challenge.user_id),
	]);
	setSessionCookie(c, token);
	await audit(c.env, c.req.raw, challenge.user_id, "SESSION_CREATED");
	return c.json({ authenticated: true, approvalStatus: "PENDING" });
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

async function issueChallenge(env: Env, userId: string, destination: string, purpose: ChallengeRow["purpose"]): Promise<string> {
	const challengeId = crypto.randomUUID();
	const otp = createOtp();
	const destinationHash = await createHash(env.OTP_HMAC_KEY, destination);
	const recent = await env.tm_secure_db.prepare("SELECT COUNT(*) AS count FROM otp_challenges WHERE destination_hash = ? AND created_at > ?").bind(destinationHash, new Date(Date.now() - 15 * 60 * 1000).toISOString()).first<{ count: number }>();
	if ((recent?.count ?? 0) >= 5) throw new Error("Too many verification requests. Try again later.");
	const otpHash = await createHash(env.OTP_HMAC_KEY, `${challengeId}:${otp}`);
	const now = new Date();
	await env.tm_secure_db.prepare("INSERT INTO otp_challenges (id, user_id, channel, destination_hash, otp_hash, purpose, expires_at, created_at) VALUES (?, ?, 'EMAIL', ?, ?, ?, ?, ?)").bind(challengeId, userId, destinationHash, otpHash, purpose, new Date(now.getTime() + TEN_MINUTES).toISOString(), now.toISOString()).run();
	await new EmailService({
		host: env.HOSTINGER_SMTP_HOST,
		port: env.HOSTINGER_SMTP_PORT,
		username: env.HOSTINGER_SMTP_USERNAME,
		password: env.HOSTINGER_SMTP_PASSWORD,
		from: env.HOSTINGER_SMTP_FROM,
	}).sendOtp(destination, otp);
	return challengeId;
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
	return { accepted: true, message: "If the account exists, a code will be sent." };
}

function maskEmail(email: string): string {
	const [local = "", domain = ""] = email.split("@");
	return `${local.slice(0, 2)}${"•".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "The request could not be completed.";
}
