CREATE TABLE licensed_applications (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_by TEXT NOT NULL REFERENCES admin_accounts(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE desktop_licenses (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES licensed_applications(id) ON DELETE CASCADE,
  license_key_hash TEXT NOT NULL UNIQUE,
  license_key_last_four TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'ACTIVE', 'REVOKED')),
  machine_hash TEXT,
  machine_label TEXT,
  activation_token_hash TEXT UNIQUE,
  issued_by TEXT NOT NULL REFERENCES admin_accounts(id),
  issued_at TEXT NOT NULL,
  activated_at TEXT,
  last_validated_at TEXT,
  revoked_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX desktop_licenses_application_idx ON desktop_licenses(application_id, issued_at DESC);
CREATE INDEX desktop_licenses_status_idx ON desktop_licenses(status, issued_at DESC);

CREATE TABLE license_events (
  id TEXT PRIMARY KEY,
  application_id TEXT REFERENCES licensed_applications(id) ON DELETE SET NULL,
  license_id TEXT REFERENCES desktop_licenses(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  machine_hash TEXT,
  ip_hash TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX license_events_license_created_idx ON license_events(license_id, created_at DESC);
CREATE INDEX license_events_application_created_idx ON license_events(application_id, created_at DESC);
CREATE INDEX license_events_ip_created_idx ON license_events(ip_hash, created_at DESC);
