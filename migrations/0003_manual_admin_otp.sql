PRAGMA foreign_keys = OFF;

ALTER TABLE otp_challenges RENAME TO otp_challenges_legacy;

CREATE TABLE otp_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'MANUAL')),
  destination_hash TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('ENROLLMENT', 'LOGIN', 'RECOVERY')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO otp_challenges (id, user_id, channel, destination_hash, otp_hash, purpose, attempts, max_attempts, expires_at, consumed_at, created_at)
SELECT id, user_id, channel, destination_hash, otp_hash, purpose, attempts, max_attempts, expires_at, consumed_at, created_at
FROM otp_challenges_legacy;

DROP TABLE otp_challenges_legacy;
CREATE INDEX otp_challenges_user_created_idx ON otp_challenges(user_id, created_at DESC);

PRAGMA foreign_keys = ON;
