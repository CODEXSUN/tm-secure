export class EmailService {
	constructor(private readonly email: SendEmail) {}

	async sendOtp(destination: string, otp: string): Promise<void> {
		try {
			await this.email.send({
				to: destination,
				from: { email: "otp@auth.techmedia.in", name: "TechMedia Secure" },
				replyTo: "support@techmedia.in",
				subject: `${otp} is your TechMedia Secure code`,
				text: `Your TechMedia Secure code is ${otp}. It expires in 10 minutes. Do not share this code.`,
				html: `<div style="font-family:Arial,sans-serif;max-width:520px;padding:32px"><p>TechMedia Secure</p><h1 style="font-size:32px;letter-spacing:4px">${otp}</h1><p>This code expires in 10 minutes. Do not share it.</p><p>If you did not request this code, you can ignore this email.</p></div>`,
			});
		} catch {
			throw new Error("Email delivery is not available. Try again later.");
		}
	}
}
