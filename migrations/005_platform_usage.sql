-- Usage starts when this version is activated. Do not invent earlier visits.
CREATE TABLE platform_usage_daily (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
 day date NOT NULL,
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,day)
);
CREATE INDEX platform_usage_day ON platform_usage_daily(day,group_id);
CREATE INDEX platform_usage_recent ON platform_usage_daily(last_seen_at);
