interface ResendResponse {
	id?: string;
	message?: string;
}

export class EmailService {
	constructor(private readonly apiKey: string) {}

	async sendOtp(destination: string, otp: string): Promise<void> {
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: "TechMedia Secure <otp@auth.techmedia.in>",
				to: [destination],
				reply_to: "support@techmedia.in",
				subject: `${otp} is your TechMedia Secure code`,
				text: `Your TechMedia Secure code is ${otp}. It expires in 10 minutes. Do not share this code.`,
				html: `<div style="font-family:Arial,sans-serif;max-width:520px;padding:32px"><p>TechMedia Secure</p><h1 style="font-size:32px;letter-spacing:4px">${otp}</h1><p>This code expires in 10 minutes. Do not share it.</p><p>If you did not request this code, you can ignore this email.</p></div>`,
			}),
		});
		if (!response.ok) {
			const result = await response.json<ResendResponse>().catch(() => ({}));
			throw new Error(result.message ?? "Email delivery failed.");
		}
	}
}
