import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { AdminAuthService, type AdminPrincipal } from "./admin-auth.service";

const ADMIN_COOKIE = "tm_secure_admin";
type Variables = { admin: AdminPrincipal };

export const adminRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

adminRoutes.post("/auth/login", async (c) => {
	const body = await c.req.json<{ email?: string; password?: string }>();
	try {
		const result = await new AdminAuthService(c.env).login(body.email ?? "", body.password ?? "", c.req.raw);
		setCookie(c, ADMIN_COOKIE, result.token, { httpOnly: true, secure: true, sameSite: "Strict", path: "/", maxAge: 86_400 });
		return c.json({ authenticated: true, admin: result.principal });
	} catch (error) {
		return c.json({ error: message(error) }, 401);
	}
});

adminRoutes.get("/auth/session", async (c) => {
	const principal = await new AdminAuthService(c.env).authenticate(getCookie(c, ADMIN_COOKIE));
	return c.json(principal ? { authenticated: true, admin: normalizePrincipal(principal) } : { authenticated: false });
});

adminRoutes.post("/auth/logout", async (c) => {
	await new AdminAuthService(c.env).logout(getCookie(c, ADMIN_COOKIE));
	deleteCookie(c, ADMIN_COOKIE, { path: "/", secure: true });
	return c.json({ authenticated: false });
});

adminRoutes.use("*", async (c, next) => {
	const principal = await new AdminAuthService(c.env).authenticate(getCookie(c, ADMIN_COOKIE));
	if (!principal) return c.json({ error: "Administrator authentication is required." }, 401);
	if (isMutation(c.req.method) && !isTrustedOrigin(c.req.raw)) return c.json({ error: "The request origin is not allowed." }, 403);
	c.set("admin", normalizePrincipal(principal));
	await next();
});

adminRoutes.post("/auth/change-password", async (c) => {
	const body = await c.req.json<{ currentPassword?: string; nextPassword?: string }>();
	try {
		await new AdminAuthService(c.env).changePassword(c.get("admin").id, body.currentPassword ?? "", body.nextPassword ?? "", c.req.raw);
		return c.json({ changed: true });
	} catch (error) {
		return c.json({ error: message(error) }, 400);
	}
});

adminRoutes.get("/overview", async (c) => {
	const now = new Date().toISOString();
	const [users, pending, apps, devices, sessions, events] = await c.env.tm_secure_db.batch([
		c.env.tm_secure_db.prepare("SELECT COUNT(*) AS value FROM users"),
		c.env.tm_secure_db.prepare("SELECT COUNT(*) AS value FROM business_profiles WHERE approval_status = 'PENDING'"),
		c.env.tm_secure_db.prepare("SELECT COUNT(*) AS value FROM oauth_clients WHERE status = 'ACTIVE'"),
		c.env.tm_secure_db.prepare("SELECT COUNT(*) AS value FROM registered_devices WHERE trust_status = 'TRUSTED'"),
		c.env.tm_secure_db.prepare("SELECT COUNT(*) AS value FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > ?").bind(now),
		c.env.tm_secure_db.prepare("SELECT event_type AS eventType, actor_type AS actorType, created_at AS createdAt FROM audit_events ORDER BY created_at DESC LIMIT 8"),
	]);
	return c.json({ metrics: { users: value(users), pending: value(pending), apps: value(apps), devices: value(devices), sessions: value(sessions) }, events: events.results });
});

adminRoutes.get("/users", async (c) => {
	const result = await c.env.tm_secure_db.prepare("SELECT u.id, u.status, u.created_at AS createdAt, bp.approval_status AS approvalStatus, MAX(CASE WHEN i.type = 'MOBILE' THEN i.display_value END) AS mobile, MAX(CASE WHEN i.type = 'EMAIL' THEN i.display_value END) AS email, MAX(CASE WHEN i.type = 'USERNAME' THEN i.display_value END) AS username FROM users u JOIN business_profiles bp ON bp.user_id = u.id LEFT JOIN user_identifiers i ON i.user_id = u.id GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200").all();
	return c.json({ users: result.results });
});

adminRoutes.patch("/users/:id/approval", async (c) => {
	const body = await c.req.json<{ status?: "APPROVED" | "REJECTED" | "SUSPENDED" }>();
	if (!body.status || !["APPROVED", "REJECTED", "SUSPENDED"].includes(body.status)) return c.json({ error: "Select a valid approval status." }, 400);
	const userStatus = body.status === "APPROVED" ? "ACTIVE" : body.status === "REJECTED" ? "REJECTED" : "SUSPENDED";
	const now = new Date().toISOString();
	await c.env.tm_secure_db.batch([
		c.env.tm_secure_db.prepare("UPDATE business_profiles SET approval_status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE user_id = ?").bind(body.status, c.get("admin").id, now, now, c.req.param("id")),
		c.env.tm_secure_db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").bind(userStatus, now, c.req.param("id")),
	]);
	await new AdminAuthService(c.env).audit(c.get("admin").id, "BUSINESS_PROFILE_STATUS_CHANGED", c.req.raw, { userId: c.req.param("id"), status: body.status });
	return c.json({ updated: true });
});

adminRoutes.get("/applications", async (c) => {
	const result = await c.env.tm_secure_db.prepare("SELECT id, client_id AS clientId, name, domain, client_type AS clientType, status, scopes_json AS scopes, created_at AS createdAt FROM oauth_clients ORDER BY created_at DESC").all();
	return c.json({ applications: result.results });
});

adminRoutes.post("/applications", async (c) => {
	const body = await c.req.json<{ clientId?: string; name?: string; domain?: string; clientType?: string; scopes?: string[] }>();
	if (!body.clientId || !body.name || !body.domain || !body.clientType) return c.json({ error: "Complete all required application fields." }, 400);
	if (!/^[a-z0-9-]{3,64}$/u.test(body.clientId)) return c.json({ error: "Use a lowercase client ID with letters, numbers, and dashes." }, 400);
	const now = new Date().toISOString();
	await c.env.tm_secure_db.prepare("INSERT INTO oauth_clients (id, client_id, name, domain, client_type, status, scopes_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)").bind(crypto.randomUUID(), body.clientId, body.name.trim(), body.domain.trim().toLowerCase(), body.clientType, JSON.stringify(body.scopes ?? ["openid", "profile"]), c.get("admin").id, now, now).run();
	await new AdminAuthService(c.env).audit(c.get("admin").id, "OAUTH_CLIENT_CREATED", c.req.raw, { clientId: body.clientId });
	return c.json({ created: true }, 201);
});

adminRoutes.get("/devices", async (c) => {
	const result = await c.env.tm_secure_db.prepare("SELECT d.id, d.label, d.platform, d.trust_status AS trustStatus, d.first_seen_at AS firstSeenAt, d.last_seen_at AS lastSeenAt, i.display_value AS user FROM registered_devices d LEFT JOIN user_identifiers i ON i.user_id = d.user_id AND i.type = 'USERNAME' ORDER BY d.last_seen_at DESC LIMIT 200").all();
	return c.json({ devices: result.results });
});

adminRoutes.get("/sessions", async (c) => {
	const result = await c.env.tm_secure_db.prepare("SELECT s.id, s.authentication_method AS authenticationMethod, s.user_agent AS userAgent, s.created_at AS createdAt, s.last_seen_at AS lastSeenAt, s.expires_at AS expiresAt, s.revoked_at AS revokedAt, i.display_value AS user FROM auth_sessions s LEFT JOIN user_identifiers i ON i.user_id = s.user_id AND i.type = 'USERNAME' ORDER BY s.last_seen_at DESC LIMIT 200").all();
	return c.json({ sessions: result.results });
});

adminRoutes.post("/sessions/:id/revoke", async (c) => {
	await c.env.tm_secure_db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(new Date().toISOString(), c.req.param("id")).run();
	await new AdminAuthService(c.env).audit(c.get("admin").id, "USER_SESSION_REVOKED", c.req.raw, { sessionId: c.req.param("id") });
	return c.json({ revoked: true });
});

adminRoutes.get("/audit", async (c) => {
	const result = await c.env.tm_secure_db.prepare("SELECT id, event_type AS eventType, actor_type AS actorType, actor_id AS actorId, details_json AS details, created_at AS createdAt FROM audit_events ORDER BY created_at DESC LIMIT 250").all();
	return c.json({ events: result.results });
});

adminRoutes.get("/settings", (c) => c.json({ retention: { otpMinutes: 10, fullIpDays: 30, ipHashDays: 180, sessionDays: 30, securityEventDays: 730, adminAuditDays: 2555 }, security: { passwordIterations: 310000, adminSessionHours: 24, businessApprovalRequired: true, oneBusinessProfilePerUser: true } }));

function normalizePrincipal(principal: AdminPrincipal): AdminPrincipal {
	return { ...principal, mustChangePassword: Boolean(principal.mustChangePassword) };
}
function isMutation(method: string): boolean { return !["GET", "HEAD", "OPTIONS"].includes(method); }
function isTrustedOrigin(request: Request): boolean { const origin = request.headers.get("origin"); return !origin || new URL(origin).host === new URL(request.url).host; }
function value(result: D1Result): number { return Number((result.results[0] as { value?: number } | undefined)?.value ?? 0); }
function message(error: unknown): string { return error instanceof Error ? error.message : "The request could not be completed."; }
