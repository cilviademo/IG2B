-- Indigold system-of-record schema (Postgres). Idempotent: safe to re-run.
-- Text ids match the application id() format (e.g. node_xxx). All rows are
-- scoped to a user_id. Raw captures (Truth Layer A) are immutable by convention.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS captures (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  source            TEXT NOT NULL,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  truth_layer       TEXT NOT NULL DEFAULT 'A',
  status            TEXT NOT NULL DEFAULT 'inbox',
  sensitivity       TEXT NOT NULL DEFAULT 'private',
  processing_status TEXT NOT NULL DEFAULT 'unprocessed',
  title             TEXT NOT NULL,
  note              TEXT NOT NULL DEFAULT '',
  url               TEXT,
  screenshot_ref    TEXT,
  raw               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS captures_user_status_idx ON captures(user_id, status);

CREATE TABLE IF NOT EXISTS nodes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',
  truth_layer TEXT NOT NULL DEFAULT 'C',
  truth_label TEXT NOT NULL DEFAULT 'Knowledge',
  mvs         INTEGER NOT NULL DEFAULT 50,
  tags        JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_capture_id TEXT REFERENCES captures(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nodes_user_idx ON nodes(user_id);
CREATE INDEX IF NOT EXISTS nodes_user_mvs_idx ON nodes(user_id, mvs DESC);

CREATE TABLE IF NOT EXISTS edges (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  weight       REAL NOT NULL DEFAULT 0.5,
  valid_from   TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until  TIMESTAMPTZ,
  label        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS edges_user_idx ON edges(user_id);
CREATE INDEX IF NOT EXISTS edges_source_idx ON edges(source_id);
CREATE INDEX IF NOT EXISTS edges_target_idx ON edges(target_id);

CREATE TABLE IF NOT EXISTS timeline_events (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  type         TEXT NOT NULL,
  significance TEXT NOT NULL DEFAULT 'medium',
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  node_id      TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS timeline_user_date_idx ON timeline_events(user_id, date DESC);

CREATE TABLE IF NOT EXISTS context_packs (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  purpose           TEXT NOT NULL DEFAULT '',
  token_budget_total INTEGER NOT NULL DEFAULT 4000,
  token_budget_used  INTEGER NOT NULL DEFAULT 0,
  source_nodes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  sections          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS context_packs_user_idx ON context_packs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS briefs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  period     TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS briefs_user_idx ON briefs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agents (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  kind    TEXT NOT NULL,
  config  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  type       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'queued',
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  result     JSONB,
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_user_idx ON jobs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    TEXT,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_user_idx ON audit_logs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_usage (
  user_id    TEXT NOT NULL,
  day        DATE NOT NULL,
  tokens     BIGINT NOT NULL DEFAULT 0,
  api_calls  BIGINT NOT NULL DEFAULT 0,
  cost_cents BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Uploaded binary assets (images, PDFs, video, docs). The bytes live in PRIVATE
-- object storage; this row holds only metadata + the storage key. Never a public URL.
CREATE TABLE IF NOT EXISTS assets (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capture_id   TEXT REFERENCES captures(id) ON DELETE CASCADE,
  storage_key  TEXT NOT NULL,
  filename     TEXT NOT NULL,
  mime         TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes   BIGINT NOT NULL DEFAULT 0,
  visibility   TEXT NOT NULL DEFAULT 'private',
  status       TEXT NOT NULL DEFAULT 'stored',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_user_idx ON assets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assets_capture_idx ON assets(capture_id);

-- ===========================================================================
-- Cognition Expansion Wave A — Event Store (the spine). Append-only audit +
-- replay substrate; never mutated or deleted. Current-state tables stay the fast
-- read path. Every pipeline write emits an event. Additive.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  ts             TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id        TEXT,
  actor          TEXT NOT NULL DEFAULT 'system',
  event_type     TEXT NOT NULL,
  subject_type   TEXT NOT NULL,
  subject_id     TEXT,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT
);
CREATE INDEX IF NOT EXISTS events_correlation_idx ON events(correlation_id, ts);
CREATE INDEX IF NOT EXISTS events_subject_idx ON events(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS events_user_ts_idx ON events(user_id, ts DESC);

