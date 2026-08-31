import { useState } from "react";
import type { ManagedUser, ManualOtpIssue } from "../../domain/types";
import { Empty, PageIntro, Status } from "../AdminLayout";

export function VerificationCodesPage({ users, onIssue }: { users: ManagedUser[]; onIssue: (id: string) => Promise<ManualOtpIssue> }) {
	const [issued, setIssued] = useState<{ username: string; otp: string; expiresAt: string } | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);

	async function issue(user: ManagedUser) {
		setPendingId(user.id);
		try {
			const result = await onIssue(user.id);
			setIssued({ username: user.username, ...result });
		} finally {
			setPendingId(null);
		}
	}

	return <><PageIntro title="OTP codes" description="Create a six-digit OTP for a pending or active identity. Each OTP expires after 10 minutes."/>
		{issued && <section className="manual-code"><span>OTP for {issued.username}</span><strong>{issued.otp}</strong><small>Expires {new Date(issued.expiresAt).toLocaleTimeString()}</small></section>}
		{users.length ? <section className="table-wrap"><table><thead><tr><th>Identity</th><th>Mobile</th><th>Status</th><th>Action</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.username}</strong><small>{user.email}</small></td><td>{user.mobile}</td><td><Status value={user.status}/></td><td className="actions"><button disabled={pendingId === user.id} onClick={() => void issue(user)}>{pendingId === user.id ? "Creating…" : user.status === "PENDING_ADMIN_APPROVAL" ? "Approve & create OTP" : "Create new OTP"}</button></td></tr>)}</tbody></table></section> : <Empty>No pending or active identities are available.</Empty>}</>;
}
