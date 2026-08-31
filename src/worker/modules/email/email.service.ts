import { connect } from "cloudflare:sockets";

interface SmtpConfiguration {
	host: string;
	port: string;
	username: string;
	password: string;
	from: string;
}

export class EmailService {
	constructor(private readonly configuration: SmtpConfiguration) {}

	async sendOtp(destination: string, otp: string): Promise<void> {
		const { host, port, username, password, from } = this.configuration;
		const socket = connect({ hostname: host, port: Number(port) }, { secureTransport: "on", allowHalfOpen: false });
		const smtp = new SmtpSession(socket.readable, socket.writable);

		try {
			await smtp.expect(220);
			await smtp.command("EHLO secure.techmedia.in", 250);
			await smtp.command("AUTH LOGIN", 334);
			await smtp.command(toBase64(username), 334);
			await smtp.command(toBase64(password), 235);
			await smtp.command(`MAIL FROM:<${toHeaderValue(from)}>`, 250);
			await smtp.command(`RCPT TO:<${toHeaderValue(destination)}>`, 250, 251);
			await smtp.command("DATA", 354);
			await smtp.sendData(createOtpMessage(destination, from, otp));
			await smtp.expect(250);
			await smtp.command("QUIT", 221);
		} catch {
			throw new Error("Email delivery is not available. Try again later.");
		} finally {
			await smtp.close();
		}
	}
}

class SmtpSession {
	private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
	private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
	private readonly decoder = new TextDecoder();
	private readonly encoder = new TextEncoder();
	private buffer = "";

	constructor(readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array>) {
		this.reader = readable.getReader();
		this.writer = writable.getWriter();
	}

	async command(command: string, ...expectedCodes: number[]): Promise<void> {
		await this.writer.write(this.encoder.encode(`${command}\r\n`));
		await this.expect(...expectedCodes);
	}

	async sendData(message: string): Promise<void> {
		await this.writer.write(this.encoder.encode(`${message}\r\n.\r\n`));
	}

	async expect(...expectedCodes: number[]): Promise<void> {
		const response = await this.readResponse();
		if (!expectedCodes.includes(response.code)) throw new Error(`SMTP rejected the request with ${response.code}.`);
	}

	async close(): Promise<void> {
		try {
			await this.writer.close();
		} finally {
			this.writer.releaseLock();
			this.reader.releaseLock();
		}
	}

	private async readResponse(): Promise<{ code: number }> {
		let code: number | null = null;
		while (true) {
			const line = await this.readLine();
			const match = /^(\d{3})([ -])/u.exec(line);
			if (!match) throw new Error("SMTP returned an invalid response.");
			const responseCode = Number(match[1]);
			code ??= responseCode;
			if (responseCode !== code) throw new Error("SMTP returned an inconsistent response.");
			if (match[2] === " ") return { code };
		}
	}

	private async readLine(): Promise<string> {
		while (true) {
			const lineEnd = this.buffer.indexOf("\r\n");
			if (lineEnd >= 0) {
				const line = this.buffer.slice(0, lineEnd);
				this.buffer = this.buffer.slice(lineEnd + 2);
				return line;
			}
			const { done, value } = await this.reader.read();
			if (done) throw new Error("SMTP connection closed unexpectedly.");
			this.buffer += this.decoder.decode(value, { stream: true });
		}
	}
}

function createOtpMessage(destination: string, from: string, otp: string): string {
	const subject = `${otp} is your TechMedia Secure code`;
	const text = `Your TechMedia Secure code is ${otp}. It expires in 10 minutes. Do not share this code. If you did not request it, you can ignore this email.`;
	const html = `<div style="font-family:Arial,sans-serif;max-width:520px;padding:32px"><p>TechMedia Secure</p><h1 style="font-size:32px;letter-spacing:4px">${otp}</h1><p>This code expires in 10 minutes. Do not share it.</p><p>If you did not request this code, you can ignore this email.</p></div>`;
	const boundary = `tm-secure-${crypto.randomUUID()}`;
	return [
		"MIME-Version: 1.0",
		`From: TechMedia Secure <${toHeaderValue(from)}>`,
		`To: ${toHeaderValue(destination)}`,
		`Reply-To: ${toHeaderValue(from)}`,
		`Subject: ${toHeaderValue(subject)}`,
		`Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
		"",
		`--${boundary}`,
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: 8bit",
		"",
		text,
		`--${boundary}`,
		"Content-Type: text/html; charset=UTF-8",
		"Content-Transfer-Encoding: 8bit",
		"",
		html,
		`--${boundary}--`,
	].join("\r\n");
}

function toBase64(value: string): string {
	return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
}

function toHeaderValue(value: string): string {
	return value.replace(/[\r\n]/gu, "");
}
