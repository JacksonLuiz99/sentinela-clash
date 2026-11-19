CREATE TABLE IF NOT EXISTS alert_channels (
  clan_tag TEXT PRIMARY KEY,
  webhook_url TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
