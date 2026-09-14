import type { ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import type { AdminPage, AdminPrincipal } from "../domain/types";
import { humanize } from "./format";

const pages: Array<{ id: AdminPage; label: string }> = [
	{ id: "overview", label: "Overview" }, { id: "users", label: "Users & approvals" }, { id: "verification-codes", label: "OTP codes" }, { id: "applications", label: "Applications" }, { id: "licenses", label: "Desktop licenses" },
	{ id: "devices", label: "Devices" }, { id: "sessions", label: "Browser sessions" }, { id: "audit", label: "Audit log" }, { id: "settings", label: "Security settings" },
];

export function AdminLayout({ admin, page, onNavigate, onLogout, children }: { admin: AdminPrincipal; page: AdminPage; onNavigate: (page: AdminPage) => void; onLogout: () => void; children: ReactNode }) {
	return <div className="admin-shell">
		<aside className="admin-sidebar"><a className="admin-brand" href="/"><img src="/logo.svg" alt=""/><strong>Tech Media</strong></a><nav>{pages.map((item) => <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => onNavigate(item.id)}>{item.label}</button>)}</nav><div className="admin-profile"><strong>{admin.displayName}</strong><span>{admin.email}</span><button onClick={onLogout}>Sign out</button></div></aside>
		<section className="admin-workspace"><header><div><p>TECHMEDIA SECURE</p><h1>{pages.find((item) => item.id === page)?.label}</h1></div><span className="environment">Production identity</span></header>{children}</section>
	</div>;
}

export function PageIntro({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="page-intro"><div><h2>{title}</h2><p>{description}</p></div>{action}</div>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty-state">{children}</div>; }
export function Status({ value }: { value: string }) {
	const available = value.toUpperCase() === "AVAILABLE";
	return <span className={`status status--${humanize(value.toLowerCase(), "-")}`}>{available && <CircleCheck aria-hidden="true"/>}{humanize(value)}</span>;
}
