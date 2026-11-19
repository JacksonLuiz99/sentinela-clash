CREATE TABLE roster_days (
  clan_tag TEXT NOT NULL, day TEXT NOT NULL, captured_at INTEGER NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY(clan_tag,day)
);
CREATE INDEX roster_days_time ON roster_days(captured_at);
CREATE TABLE roster_moves (
  id TEXT PRIMARY KEY, clan_tag TEXT NOT NULL, player_tag TEXT NOT NULL,
  name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('join','leave')), detected_at INTEGER NOT NULL
);
CREATE INDEX roster_moves_time ON roster_moves(detected_at DESC);
CREATE INDEX roster_moves_player ON roster_moves(player_tag,detected_at);
CREATE TABLE manual_wars (
  id TEXT PRIMARY KEY, clan_tag TEXT NOT NULL, revision INTEGER NOT NULL,
  end_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL,
  UNIQUE(clan_tag,end_at)
);
CREATE INDEX manual_wars_clan ON manual_wars(clan_tag,end_at DESC);
CREATE TABLE clan_goals (
  clan_tag TEXT PRIMARY KEY, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL
);
