import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { authRoutes } from "./modules/auth/auth.routes";
import { adminRoutes } from "./modules/admin/admin.routes";

const app = new Hono<{ Bindings: Env }>();

app.use("*", secureHeaders({
	contentSecurityPolicy: {
		defaultSrc: ["'self'"],
		styleSrc: ["'self'", "'unsafe-inline'"],
		imgSrc: ["'self'", "data:"],
		connectSrc: ["'self'"],
	},
	referrerPolicy: "no-referrer",
}));

app.get("/api/v1/health", (c) => c.json({ service: "tm-secure", status: "ok" }));
app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/admin", adminRoutes);
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
