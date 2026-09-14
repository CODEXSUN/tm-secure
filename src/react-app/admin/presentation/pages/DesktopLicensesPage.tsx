import { type FormEvent, useState } from "react";
import type { DesktopLicense, DesktopLicenseSnapshot, IssuedDesktopLicense, LicensedApplication } from "../../domain/types";
import { Empty, PageIntro, Status } from "../AdminLayout";

interface Props {
	data: DesktopLicenseSnapshot | null;
	onRegisterApplication: (appId: string, name: string) => Promise<void>;
	onIssue: (applicationId: string) => Promise<IssuedDesktopLicense>;
	onRevoke: (licenseId: string) => Promise<void>;
	onReset: (licenseId: string) => Promise<void>;
	onArchive: (licenseId: string) => Promise<void>;
}

export function DesktopLicensesPage({ data, onRegisterApplication, onIssue, onRevoke, onReset, onArchive }: Props) {
	const [showRegistration, setShowRegistration] = useState(false);
	const [pendingAction, setPendingAction] = useState<string | null>(null);
	const [issued, setIssued] = useState<IssuedDesktopLicense | null>(null);
	const [error, setError] = useState("");
	const applications = data?.applications ?? [];
	const licenses = data?.licenses ?? [];

	async function registerApplication(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		await run("register", async () => {
			await onRegisterApplication(String(form.get("appId")), String(form.get("name")));
			setShowRegistration(false);
		});
	}

	async function issueLicense(application: LicensedApplication) {
		await run(`issue:${application.id}`, async () => setIssued(await onIssue(application.id)));
	}

	async function archiveLicense(license: DesktopLicense) {
		if (!window.confirm(`Archive license ending in ${license.lastFour}? This currently removes the license permanently.`)) return;
		await run(`archive:${license.id}`, () => onArchive(license.id));
	}

	async function run(key: string, action: () => Promise<void>) {
		setPendingAction(key);
		setError("");
		try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : "The license request failed."); } finally { setPendingAction(null); }
	}

	return <>
		<PageIntro title="Desktop licenses" description="Register desktop applications and issue one-machine activation keys." action={<button className="primary-action" onClick={() => setShowRegistration(!showRegistration)}>{showRegistration ? "Close" : "Register desktop app"}</button>}/>
		{issued && <section className="manual-code"><span>New 16-digit license key</span><strong className="license-key">{issued.licenseKey}</strong><small>Copy this key now. The server stores only its secure hash.</small></section>}
		{error && <p className="admin-error">{error}</p>}
		{showRegistration && <form className="inline-form license-app-form" onSubmit={registerApplication}><label>Application ID<input name="appId" placeholder="techmedia-desktop" pattern="[a-z0-9-]{3,64}" required/></label><label>Application name<input name="name" placeholder="Tech Media Desktop" minLength={2} maxLength={120} required/></label><button disabled={pendingAction === "register"}>{pendingAction === "register" ? "Registering…" : "Register"}</button></form>}
		<ApplicationList applications={applications} pendingAction={pendingAction} onIssue={issueLicense}/>
		<LicenseList licenses={licenses} pendingAction={pendingAction} onRevoke={(license) => run(`revoke:${license.id}`, () => onRevoke(license.id))} onReset={(license) => run(`reset:${license.id}`, () => onReset(license.id))} onArchive={archiveLicense}/>
	</>;
}

function ApplicationList({ applications, pendingAction, onIssue }: { applications: LicensedApplication[]; pendingAction: string | null; onIssue: (application: LicensedApplication) => Promise<void> }) {
	return <section className="license-section"><h3>Desktop applications</h3>{applications.length ? <div className="table-wrap"><table><thead><tr><th>Application</th><th>Application ID</th><th>Status</th><th>Action</th></tr></thead><tbody>{applications.map((application) => <tr key={application.id}><td><strong>{application.name}</strong></td><td><code>{application.appId}</code></td><td><Status value={application.status}/></td><td className="actions"><button className="license-generate" disabled={pendingAction === `issue:${application.id}`} onClick={() => void onIssue(application)}>{pendingAction === `issue:${application.id}` ? "Generating…" : "Generate key"}</button></td></tr>)}</tbody></table></div> : <Empty>Register a desktop application before you generate a license key.</Empty>}</section>;
}

function LicenseList({ licenses, pendingAction, onRevoke, onReset, onArchive }: { licenses: DesktopLicense[]; pendingAction: string | null; onRevoke: (license: DesktopLicense) => void; onReset: (license: DesktopLicense) => void; onArchive: (license: DesktopLicense) => void }) {
	return <section className="license-section"><h3>Issued licenses</h3>{licenses.length ? <div className="table-wrap"><table><thead><tr><th>License</th><th>Application</th><th>Machine</th><th>Status</th><th>Last checked</th><th>Actions</th></tr></thead><tbody>{licenses.map((license) => <tr key={license.id}><td><strong>••••-••••-••••-{license.lastFour}</strong><small>{new Date(license.issuedAt).toLocaleDateString()}</small></td><td><strong>{license.applicationName}</strong><small>{license.appId}</small></td><td>{license.machineLabel ?? "Not activated"}</td><td><Status value={license.status}/></td><td>{license.lastValidatedAt ? new Date(license.lastValidatedAt).toLocaleString() : "Never"}</td><td className="actions"><button disabled={license.status === "AVAILABLE" || pendingAction === `reset:${license.id}`} onClick={() => onReset(license)}>{pendingAction === `reset:${license.id}` ? "Resetting…" : "Reset machine"}</button><button className="danger-action" disabled={license.status === "REVOKED" || pendingAction === `revoke:${license.id}`} onClick={() => onRevoke(license)}>{pendingAction === `revoke:${license.id}` ? "Revoking…" : "Revoke"}</button><button className="danger-action" disabled={pendingAction === `archive:${license.id}`} onClick={() => onArchive(license)}>{pendingAction === `archive:${license.id}` ? "Archiving…" : "Archive"}</button></td></tr>)}</tbody></table></div> : <Empty>No desktop license keys have been issued.</Empty>}</section>;
}
