import { FormEvent, useEffect, useState } from "react";
import { AdminApp } from "./admin/AdminApp";
import { Button } from "@/react-app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Input } from "@/react-app/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/react-app/components/ui/input-otp";
import { Label } from "@/react-app/components/ui/label";
import { Check, LoaderCircle } from "lucide-react";

type View = "SIGN_IN" | "ENROLL" | "VERIFY" | "PENDING" | "ACCOUNT";
interface ApiError { error?: string }
type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
interface AccountSession { authenticated: boolean; approvalStatus?: ApprovalStatus }

function App() {
	if (window.location.pathname.startsWith("/admin")) return <AdminApp />;
	return <PublicPortal />;
}

function PublicPortal() {
	const [view, setView] = useState<View>(() => window.location.pathname === "/verify" ? "VERIFY" : "SIGN_IN");
	const [identifier, setIdentifier] = useState("");
	const [mobile, setMobile] = useState("");
	const [email, setEmail] = useState("");
	const [username, setUsername] = useState("");
	const [otp, setOtp] = useState("");
	const [message, setMessage] = useState("");
	const [pending, setPending] = useState(false);
	const [developmentBypass, setDevelopmentBypass] = useState(false);
	const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("PENDING");

	useEffect(() => {
		void Promise.all([
			fetch("/api/v1/auth/session").then((response) => response.json() as Promise<AccountSession>),
			fetch("/api/v1/auth/development/status").then((response) => response.json() as Promise<{ enabled: boolean }>),
		]).then(([session, development]) => { if (session.authenticated) { setApprovalStatus(session.approvalStatus ?? "PENDING"); setView("ACCOUNT"); } setDevelopmentBypass(development.enabled); });
	}, []);

	async function requestLogin(event: FormEvent) {
		event.preventDefault();
		await run(async () => {
			await post("/api/v1/auth/otp/request", { mobile: identifier });
			window.history.pushState({}, "", "/verify");
			setView("VERIFY");
		});
	}

	async function requestEnrollment(event: FormEvent) {
		event.preventDefault();
		await run(async () => {
			await post("/api/v1/auth/enrollment/request", { mobile, email, username });
			setIdentifier(mobile);
			setView("PENDING");
		});
	}

	async function verifyOtp(event: FormEvent) {
		event.preventDefault();
		await run(async () => { const result = await post<AccountSession>("/api/v1/auth/otp/verify", { identifier, otp }); setApprovalStatus(result.approvalStatus ?? "PENDING"); setView("ACCOUNT"); });
	}

	async function bypassLogin() {
		await run(async () => { const result = await post<AccountSession>("/api/v1/auth/development/login", {}); setApprovalStatus(result.approvalStatus ?? "PENDING"); setView("ACCOUNT"); });
	}

	async function logout() { await post("/api/v1/auth/logout", {}); setView("SIGN_IN"); setOtp(""); setMessage(""); }
	async function run(action: () => Promise<void>) {
		setPending(true); setMessage("");
		try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "The request could not be completed."); } finally { setPending(false); }
	}

	return <div className="flex min-h-svh flex-col bg-neutral-50 text-neutral-950">
		<header className="flex h-16 items-center border-b border-neutral-200 bg-white px-5 sm:px-8"><div className="flex items-center gap-3"><img className="h-8 w-9 object-contain" src="/logo.svg" alt="Tech Media"/><span className="text-base font-semibold tracking-tight">Tech Media</span></div></header>
		<main className="flex flex-1 items-center justify-center p-5 sm:p-8">
			<Card className="w-full max-w-md border-neutral-200 shadow-none" aria-live="polite">
				{view === "SIGN_IN" && <><CardHeader><CardTitle className="text-2xl tracking-tight">Sign in</CardTitle><CardDescription>Enter your mobile number to continue.</CardDescription></CardHeader><CardContent><form className="grid gap-5" onSubmit={requestLogin}><div className="grid gap-2"><Label htmlFor="identifier">Mobile number</Label><Input id="identifier" autoFocus inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" minLength={10} maxLength={10} value={identifier} onChange={(event) => setIdentifier(event.target.value.replace(/\D/gu, "").slice(0, 10))} placeholder="9876543210" required/></div><Button disabled={pending || identifier.length !== 10}>{pending && <LoaderCircle className="size-4 animate-spin"/>}{pending ? "Continuing" : "Continue"}</Button><Button variant="ghost" type="button" onClick={() => setView("ENROLL")}>Create an account</Button>{developmentBypass && <div className="grid gap-3 border-t pt-5"><span className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">Development only</span><Button variant="outline" type="button" disabled={pending} onClick={() => void bypassLogin()}>Continue without OTP</Button></div>}</form></CardContent></>}
				{view === "ENROLL" && <><CardHeader><CardTitle className="text-2xl tracking-tight">Create your account</CardTitle><CardDescription>Your identity must be approved before sign-in.</CardDescription></CardHeader><CardContent><form className="grid gap-5" onSubmit={requestEnrollment}><div className="grid gap-2"><Label htmlFor="mobile">Mobile number</Label><Input id="mobile" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" minLength={10} maxLength={10} value={mobile} onChange={(event) => setMobile(event.target.value.replace(/\D/gu, "").slice(0, 10))} placeholder="9876543210" required/></div><div className="grid gap-2"><Label htmlFor="email">Email address</Label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required/></div><div className="grid gap-2"><Label htmlFor="username">Username</Label><Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="vijay" required/></div><Button disabled={pending || mobile.length !== 10}>{pending && <LoaderCircle className="size-4 animate-spin"/>}{pending ? "Submitting" : "Submit for approval"}</Button><Button variant="ghost" type="button" onClick={() => setView("SIGN_IN")}>Return to sign in</Button></form></CardContent></>}
				{view === "PENDING" && <><CardHeader><CardTitle className="text-2xl tracking-tight">Registration submitted</CardTitle><CardDescription>Your identity is waiting for approval.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => { window.history.pushState({}, "", "/verify"); setView("VERIFY"); }}>Enter OTP</Button></CardContent></>}
				{view === "VERIFY" && <><CardHeader><CardTitle className="text-2xl tracking-tight">Enter OTP</CardTitle><CardDescription>Enter the six-digit OTP to continue. It expires in 10 minutes.</CardDescription></CardHeader><CardContent><form className="grid gap-5" onSubmit={verifyOtp}><div className="grid gap-2"><Label htmlFor="verify-identifier">Mobile number</Label><Input id="verify-identifier" autoFocus={identifier.length !== 10} inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" minLength={10} maxLength={10} value={identifier} onChange={(event) => setIdentifier(event.target.value.replace(/\D/gu, "").slice(0, 10))} placeholder="9876543210" required/></div><div className="grid gap-2"><Label htmlFor="otp">OTP</Label><InputOTP id="otp" autoFocus={identifier.length === 10} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="^[0-9]+$" value={otp} onChange={setOtp}><InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot index={index} key={index}/>)}</InputOTPGroup></InputOTP></div><Button disabled={pending || identifier.length !== 10 || otp.length !== 6}>{pending && <LoaderCircle className="size-4 animate-spin"/>}{pending ? "Verifying" : "Verify and continue"}</Button><Button variant="ghost" type="button" onClick={() => { window.history.pushState({}, "", "/"); setView("SIGN_IN"); }}>Cancel</Button></form></CardContent></>}
				{view === "ACCOUNT" && <><CardHeader><div className="mb-2 flex size-10 items-center justify-center rounded-full bg-neutral-900 text-white"><Check className="size-5"/></div><CardTitle className="text-2xl tracking-tight">Your identity is protected</CardTitle><CardDescription>{approvalStatus === "APPROVED" ? "Your business profile is active." : "Your business profile is waiting for approval."}</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="flex items-center justify-between border-t pt-4 text-sm"><span className="text-muted-foreground">Business profile</span><span className="font-medium">{approvalStatus === "APPROVED" ? "Active" : "Pending approval"}</span></div><div className="flex items-center justify-between border-t pt-4 text-sm"><span className="text-muted-foreground">Mobile verification</span><span className="font-medium">OTP verified</span></div><Button variant="outline" onClick={() => void logout()}>Sign out</Button></CardContent></>}
				{message && <div className="mx-6 border-t pt-4 text-sm text-destructive">{message}</div>}
			</Card>
		</main>
		<footer className="flex items-center justify-between px-5 py-4 text-xs text-muted-foreground sm:px-8"><span>© 2026 Tech Media</span><span>Secure identity service</span></footer>
	</div>;
}

async function post<T = unknown>(url: string, body: object): Promise<T> { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json() as T & ApiError; if (!response.ok) throw new Error(result.error ?? "The request could not be completed."); return result; }
export default App;
