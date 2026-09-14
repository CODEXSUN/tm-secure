import { Hono, type Context } from "hono";
import { LicenseRequestError, LicenseService } from "./license.service";

export const licenseRoutes = new Hono<{ Bindings: Env }>();

licenseRoutes.post("/activate", async (c) => {
	try {
		const body = await c.req.json<{ appId?: string; licenseKey?: string; machineId?: string; machineLabel?: string }>();
		const result = await new LicenseService(c.env).activate({
			appId: body.appId ?? "",
			licenseKey: body.licenseKey ?? "",
			machineId: body.machineId ?? "",
			machineLabel: body.machineLabel,
		}, c.req.raw);
		c.header("Cache-Control", "no-store");
		return c.json(result);
	} catch (error) {
		return licenseError(c, error);
	}
});

licenseRoutes.post("/validate", async (c) => {
	try {
		const body = await c.req.json<{ appId?: string; licenseToken?: string; machineId?: string }>();
		const result = await new LicenseService(c.env).validate({
			appId: body.appId ?? "",
			licenseToken: body.licenseToken ?? "",
			machineId: body.machineId ?? "",
		}, c.req.raw);
		c.header("Cache-Control", "no-store");
		return c.json(result);
	} catch (error) {
		return licenseError(c, error);
	}
});

function licenseError(c: Context<{ Bindings: Env }>, error: unknown) {
	c.header("Cache-Control", "no-store");
	if (error instanceof LicenseRequestError) return c.json({ error: error.code, message: error.message }, error.status);
	if (error instanceof Error && ["Enter a valid 16-digit license key.", "Enter a valid installation ID."].includes(error.message)) {
		return c.json({ error: "INVALID_REQUEST", message: error.message }, 400);
	}
	console.error(JSON.stringify({ message: "license request failed", error: error instanceof Error ? error.message : "Unknown error" }));
	return c.json({ error: "LICENSE_SERVICE_ERROR", message: "The license service could not complete the request." }, 500);
}
