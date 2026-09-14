import { FormEvent, useCallback, useEffect, useState } from "react";
import type { AdminPage, AdminPrincipal, AuditEvent, DesktopLicenseSnapshot, IssuedDesktopLicense, ManagedApplication, ManagedDevice, ManagedSession, ManagedUser, ManualOtpIssue, Overview, RevealedDesktopLicense } from "./domain/types";
import { adminApi } from "./infrastructure/admin-api";
import { AdminLayout } from "./presentation/AdminLayout";
import { OverviewPage } from "./presentation/pages/OverviewPage";
import { UsersPage } from "./presentation/pages/UsersPage";
import { ApplicationsPage } from "./presentation/pages/ApplicationsPage";
import { AuditPage, DevicesPage, SessionsPage } from "./presentation/pages/InventoryPages";
import { SettingsPage } from "./presentation/pages/SettingsPage";
import { VerificationCodesPage } from "./presentation/pages/VerificationCodesPage";
import { DesktopLicensesPage } from "./presentation/pages/DesktopLicensesPage";
import "./admin.css";

export function AdminApp() {
	const [admin, setAdmin] = useState<AdminPrincipal | null>(null);
	const [loading, setLoading] = useState(true);
	const [page, setPage] = useState<AdminPage>(() => pageFromPath());
	const [error, setError] = useState("");
	const [data, setData] = useState<unknown>(null);

	const loadPage = useCallback(async (selected: AdminPage) => {
		setData(null); setError("");
		try {
			const paths: Record<AdminPage, string> = { overview: "/overview", users: "/users", "verification-codes": "/verification-codes", applications: "/applications", licenses: "/licenses", devices: "/devices", sessions: "/sessions", audit: "/audit", settings: "/settings" };
			setData(await adminApi.get(paths[selected]));
		} catch (caught) { setError(caught instanceof Error ? caught.message : "The page could not be loaded."); }
	}, []);

	useEffect(() => { void adminApi.get<{ authenticated: boolean; admin?: AdminPrincipal }>("/auth/session").then((session) => { setAdmin(session.admin ?? null); if (session.admin) void loadPage(page); }).finally(() => setLoading(false)); }, [loadPage, page]);
	useEffect(() => {
		if (!admin || page !== "licenses") return;
		const timer = window.setInterval(() => {
			if (document.visibilityState === "visible") void adminApi.get("/licenses").then(setData).catch(() => undefined);
		}, 5_000);
		return () => window.clearInterval(timer);
	}, [admin, page]);

	function navigate(selected: AdminPage) {
		setPage(selected);
		const route = selected === "verification-codes" ? "otp" : selected;
		window.history.pushState({}, "", selected === "overview" ? "/admin" : `/admin/${route}`);
		void loadPage(selected);
	}
	async function login(email: string, password: string) { const result = await adminApi.post<{ admin: AdminPrincipal }>("/auth/login", { email, password }); setAdmin(result.admin); setPage(result.admin.mustChangePassword ? "settings" : "overview"); await loadPage(result.admin.mustChangePassword ? "settings" : "overview"); }
	async function logout() { await adminApi.post("/auth/logout", {}); setAdmin(null); setData(null); }

	if (loading) return <div className="admin-loading">Checking administrator session…</div>;
	if (!admin) return <AdminLogin onLogin={login}/>;

	const content = renderPage(page, data, admin, {
		approve: async (id, status) => { await adminApi.patch(`/users/${id}/approval`, { status }); await loadPage("users"); },
		createApp: async (input) => { await adminApi.post("/applications", input); await loadPage("applications"); },
		revoke: async (id) => { await adminApi.post(`/sessions/${id}/revoke`, {}); await loadPage("sessions"); },
		changePassword: async (currentPassword, nextPassword) => { await adminApi.post("/auth/change-password", { currentPassword, nextPassword }); setAdmin({ ...admin, mustChangePassword: false }); },
		issueCode: async (id) => adminApi.post<ManualOtpIssue>(`/verification-codes/${id}`, {}),
		registerLicensedApp: async (appId, name) => { await adminApi.post("/licenses/applications", { appId, name }); await loadPage("licenses"); },
		issueLicense: async (applicationId) => { const result = await adminApi.post<IssuedDesktopLicense>("/licenses", { applicationId }); await loadPage("licenses"); return result; },
		revokeLicense: async (id) => { await adminApi.post(`/licenses/${id}/revoke`, {}); await loadPage("licenses"); },
		resetLicense: async (id) => { await adminApi.post(`/licenses/${id}/reset`, {}); await loadPage("licenses"); },
		archiveLicense: async (id) => { await adminApi.post(`/licenses/${id}/archive`, {}); await loadPage("licenses"); },
		copyLicenseSerial: async (id) => adminApi.post<RevealedDesktopLicense>(`/licenses/${id}/serial`, {}),
		reactivateLicense: async (id) => { const result = await adminApi.post<RevealedDesktopLicense>(`/licenses/${id}/reactivate`, {}); await loadPage("licenses"); return result; },
	});

	return <AdminLayout admin={admin} page={page} onNavigate={navigate} onLogout={() => void logout()}>{error ? <p className="admin-error">{error}</p> : content}</AdminLayout>;
}

function AdminLogin({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
	const [error, setError] = useState(""); const [pending, setPending] = useState(false);
	async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError(""); try { await onLogin(String(data.get("email")), String(data.get("password"))); } catch (caught) { setError(caught instanceof Error ? caught.message : "Login failed."); } finally { setPending(false); } }
	return <div className="admin-login"><a href="/" className="admin-brand"><img src="/logo.svg" alt=""/><strong>Tech Media</strong></a><form onSubmit={submit}><p>RESTRICTED ACCESS</p><h1>Administrator sign in</h1><span>Manage identities, approvals, applications, devices, and security events.</span><label>Email<input type="email" name="email" defaultValue="admin@admin.com" required/></label><label>Password<input type="password" name="password" autoFocus required/></label><button disabled={pending}>{pending ? "Signing in…" : "Sign in securely"}</button>{error && <strong className="admin-error">{error}</strong>}</form></div>;
}

interface Actions {
	approve: (id: string, status: "APPROVED" | "REJECTED" | "SUSPENDED") => Promise<void>;
	createApp: (input: object) => Promise<void>;
	revoke: (id: string) => Promise<void>;
	changePassword: (current: string, next: string) => Promise<void>;
	issueCode: (id: string) => Promise<ManualOtpIssue>;
	registerLicensedApp: (appId: string, name: string) => Promise<void>;
	issueLicense: (applicationId: string) => Promise<IssuedDesktopLicense>;
	revokeLicense: (id: string) => Promise<void>;
	resetLicense: (id: string) => Promise<void>;
	archiveLicense: (id: string) => Promise<void>;
	copyLicenseSerial: (id: string) => Promise<RevealedDesktopLicense>;
	reactivateLicense: (id: string) => Promise<RevealedDesktopLicense>;
}

function renderPage(page: AdminPage, data: unknown, admin: AdminPrincipal, actions: Actions) {
	switch (page) {
		case "overview": return <OverviewPage data={data as Overview | null}/>;
		case "users": return <UsersPage users={(data as { users?: ManagedUser[] } | null)?.users ?? []} onApproval={(id, status) => void actions.approve(id, status)}/>;
		case "verification-codes": return <VerificationCodesPage users={(data as { users?: ManagedUser[] } | null)?.users ?? []} onIssue={actions.issueCode}/>;
		case "applications": return <ApplicationsPage applications={(data as { applications?: ManagedApplication[] } | null)?.applications ?? []} onCreate={actions.createApp}/>;
		case "licenses": return <DesktopLicensesPage data={data as DesktopLicenseSnapshot | null} onRegisterApplication={actions.registerLicensedApp} onIssue={actions.issueLicense} onRevoke={actions.revokeLicense} onReset={actions.resetLicense} onArchive={actions.archiveLicense} onCopySerial={actions.copyLicenseSerial} onReactivate={actions.reactivateLicense}/>;
		case "devices": return <DevicesPage devices={(data as { devices?: ManagedDevice[] } | null)?.devices ?? []}/>;
		case "sessions": return <SessionsPage sessions={(data as { sessions?: ManagedSession[] } | null)?.sessions ?? []} onRevoke={(id) => void actions.revoke(id)}/>;
		case "audit": return <AuditPage events={(data as { events?: AuditEvent[] } | null)?.events ?? []}/>;
		case "settings": return <SettingsPage admin={admin} onChangePassword={actions.changePassword}/>;
	}
}

function pageFromPath(): AdminPage {
	const value = window.location.pathname.split("/")[2];
	if (value === "otp" || value === "verification-codes") return "verification-codes";
	return ["users", "applications", "licenses", "devices", "sessions", "audit", "settings"].includes(value) ? value as AdminPage : "overview";
}
