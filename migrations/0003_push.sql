CREATE TABLE push_devices (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, endpoint_hash TEXT NOT NULL UNIQUE,
  subscription TEXT NOT NULL, clans TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  last_accepted_at INTEGER, last_error TEXT
);
CREATE TABLE push_jobs (
  id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
  clan_tag TEXT NOT NULL, war_key TEXT NOT NULL, window_hours INTEGER NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, next_try INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', accepted_at INTEGER, error TEXT
);
CREATE INDEX push_jobs_due ON push_jobs(status,next_try);
CREATE INDEX push_jobs_device ON push_jobs(device_id);
CREATE TABLE push_rate_limits (bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,created_at INTEGER NOT NULL);
INSERT OR IGNORE INTO leases(id,until_ms) VALUES ('web-push',0);
