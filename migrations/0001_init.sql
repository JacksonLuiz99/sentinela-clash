CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE leases (id TEXT PRIMARY KEY, until_ms INTEGER NOT NULL);
INSERT INTO leases (id, until_ms) VALUES ('sync', 0);
CREATE TABLE events (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, message TEXT NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER
);
CREATE INDEX events_created ON events(created_at DESC);
CREATE TABLE deliveries (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, sent_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
  next_try INTEGER NOT NULL DEFAULT 0, error TEXT,
  PRIMARY KEY (event_id, channel)
);
CREATE INDEX deliveries_pending ON deliveries(sent_at, next_try);
CREATE TABLE wars (
  id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, end_at INTEGER,
  payload TEXT NOT NULL
);
CREATE TABLE snapshots (
  hour INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, payload TEXT NOT NULL
);
