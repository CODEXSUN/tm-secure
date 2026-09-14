import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { authRoutes } from "./modules/auth/auth.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { licenseRoutes } from "./modules/licenses/license.routes";

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
app.route("/api/v1/licenses", licenseRoutes);
app.get("*", async (c) => {
	const asset = await c.env.ASSETS.fetch(c.req.raw);
	return new Response(asset.body, asset);
});

export default app;
