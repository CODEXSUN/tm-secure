import type { Overview } from "../../domain/types";
import { Empty, PageIntro } from "../AdminLayout";
import { humanize } from "../format";

export function OverviewPage({ data }: { data: Overview | null }) {
	if (!data) return <Empty>Loading security overview…</Empty>;
	const metrics = [{ key: "users", label: "Global users" }, { key: "pending", label: "Pending approvals" }, { key: "apps", label: "Active applications" }, { key: "devices", label: "Trusted devices" }, { key: "sessions", label: "Browser sessions" }] as const;
	return <><PageIntro title="Identity control center" description="Review the current identity, application, device, and session state."/><div className="metric-grid">{metrics.map((metric) => <article key={metric.key}><span>{metric.label}</span><strong>{data.metrics[metric.key]}</strong></article>)}</div><section className="data-panel"><h3>Recent security activity</h3>{data.events.length ? <div className="event-list">{data.events.map((event, index) => <div key={`${event.createdAt}-${index}`}><span className="event-dot"/><strong>{humanize(event.eventType)}</strong><small>{new Date(event.createdAt).toLocaleString()}</small></div>)}</div> : <Empty>No security events yet.</Empty>}</section></>;
}
