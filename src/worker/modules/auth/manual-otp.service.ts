import { createHash, createOtp, timingSafeEqual } from "../../shared/crypto";

const OTP_LIFETIME_MS = 10 * 60 * 1000;

interface ChallengeRow {
	id: string;
	otp_hash: string;
	attempts: number;
	max_attempts: number;
	expires_at: string;
}

export class ManualOtpService {
	constructor(private readonly env: Env) {}

	async issue(userId: string, destination: string): Promise<{ otp: string; expiresAt: string }> {
		const now = new Date();
		const otp = createOtp();
		const challengeId = crypto.randomUUID();
		const expiresAt = new Date(now.getTime() + OTP_LIFETIME_MS).toISOString();
		await this.env.tm_secure_db.batch([
			this.env.tm_secure_db.prepare("UPDATE otp_challenges SET consumed_at = ? WHERE user_id = ? AND channel = 'MANUAL' AND consumed_at IS NULL").bind(now.toISOString(), userId),
			this.env.tm_secure_db.prepare("INSERT INTO otp_challenges (id, user_id, channel, destination_hash, otp_hash, purpose, expires_at, created_at) VALUES (?, ?, 'MANUAL', ?, ?, 'ENROLLMENT', ?, ?)").bind(challengeId, userId, await createHash(this.env.OTP_HMAC_KEY, destination), await createHash(this.env.OTP_HMAC_KEY, `${challengeId}:${otp}`), expiresAt, now.toISOString()),
		]);
		return { otp, expiresAt };
	}

	async verify(userId: string, otp: string): Promise<void> {
		const challenge = await this.env.tm_secure_db.prepare("SELECT id, otp_hash, attempts, max_attempts, expires_at FROM otp_challenges WHERE user_id = ? AND channel = 'MANUAL' AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(userId).first<ChallengeRow>();
		if (!challenge || challenge.attempts >= challenge.max_attempts || new Date(challenge.expires_at) <= new Date()) throw new Error("This code is invalid or expired.");
		const candidate = await createHash(this.env.OTP_HMAC_KEY, `${challenge.id}:${otp}`);
		if (!timingSafeEqual(candidate, challenge.otp_hash)) {
			await this.env.tm_secure_db.prepare("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL").bind(challenge.id).run();
			throw new Error("This code is invalid or expired.");
		}
		await this.env.tm_secure_db.prepare("UPDATE otp_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(new Date().toISOString(), challenge.id).run();
	}
}
