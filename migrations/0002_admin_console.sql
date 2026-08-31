CREATE TABLE admin_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'SECURITY_ADMIN', 'SUPPORT_ADMIN')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL UNIQUE,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX admin_sessions_admin_id_idx ON admin_sessions(admin_id);

CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  client_type TEXT NOT NULL CHECK (client_type IN ('CONFIDENTIAL_WEB', 'PUBLIC_MOBILE', 'PUBLIC_WEB')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
  redirect_uris_json TEXT NOT NULL DEFAULT '[]',
  allowed_origins_json TEXT NOT NULL DEFAULT '[]',
  scopes_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL REFERENCES admin_accounts(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE registered_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES oauth_clients(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  platform TEXT NOT NULL,
  public_key TEXT,
  trust_status TEXT NOT NULL CHECK (trust_status IN ('PENDING', 'TRUSTED', 'REVOKED')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_ip_hash TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX registered_devices_user_id_idx ON registered_devices(user_id);

INSERT INTO admin_accounts (
  id, email, display_name, role, password_salt, password_hash,
  password_iterations, must_change_password, status, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'admin@admin.com',
  'TechMedia Administrator',
  'SUPER_ADMIN',
  'DmEXyXt-4zsyIFUHe3Rvkw',
  'ibtqGKaPPwayMBgYSacgVSfXBUdEfuNPhYwoSPh6Nog',
  310000,
  1,
  'ACTIVE',
  '2026-08-31T00:00:00.000Z',
  '2026-08-31T00:00:00.000Z'
);
