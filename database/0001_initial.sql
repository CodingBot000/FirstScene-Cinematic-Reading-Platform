-- FirstScene reference migration v1: REVIEW + TEST before applying.
-- No roles, passwords, external extensions or production data are created here.
CREATE SCHEMA IF NOT EXISTS firstscene;
REVOKE ALL ON SCHEMA firstscene FROM PUBLIC;
CREATE TABLE firstscene.schema_migrations (
 version text PRIMARY KEY, sha256 char(64) NOT NULL,
 applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE firstscene.sessions (
 id uuid PRIMARY KEY, epoch uuid NOT NULL UNIQUE,
 token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days')
);
CREATE INDEX sessions_expiry ON firstscene.sessions(expires_at);
CREATE TABLE firstscene.preferences (
 session_id uuid PRIMARY KEY REFERENCES firstscene.sessions(id) ON DELETE CASCADE,
 mode text NOT NULL DEFAULT 'cinematic' CHECK (mode IN ('cinematic','plain')),
 effects text NOT NULL DEFAULT 'full' CHECK (effects IN ('full','reduced')),
 font_size smallint NOT NULL DEFAULT 20 CHECK (font_size IN (18,20,22,24)),
 theme text NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light')),
 revision bigint NOT NULL DEFAULT 0 CHECK (revision>=0), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE firstscene.reading_progress (
 session_id uuid NOT NULL REFERENCES firstscene.sessions(id) ON DELETE CASCADE,
 story_id text NOT NULL CHECK (story_id ~ '^[a-z][a-z0-9-]{1,63}$'),
 content_version integer NOT NULL CHECK (content_version>0),
 content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
 scene_id text NOT NULL, beat_id text NOT NULL,
 fraction numeric(5,4) NOT NULL CHECK (fraction>=0 AND fraction<=1),
 furthest_ordinal integer NOT NULL CHECK (furthest_ordinal>=0),
 completed boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>=1),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(session_id,story_id)
);
CREATE TABLE firstscene.bookmarks (
 session_id uuid NOT NULL REFERENCES firstscene.sessions(id) ON DELETE CASCADE,
 story_id text NOT NULL, target_id text NOT NULL,
 content_version integer NOT NULL CHECK (content_version>0),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(session_id,story_id,target_id),
 CHECK(target_id='__story__' OR target_id ~ '^[a-z][a-z0-9-]{1,63}$')
);
CREATE TABLE firstscene.mutation_receipts (
 session_id uuid NOT NULL REFERENCES firstscene.sessions(id) ON DELETE CASCADE,
 operation_id uuid NOT NULL, request_hash char(64) NOT NULL,
 route text NOT NULL, response_status smallint NOT NULL CHECK(response_status BETWEEN 200 AND 299),
 response_body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, PRIMARY KEY(session_id,operation_id),
 CHECK (request_hash ~ '^[a-f0-9]{64}$'), CHECK (expires_at>created_at)
);
CREATE INDEX receipts_expiry ON firstscene.mutation_receipts(expires_at);
CREATE TABLE firstscene.feedback (
 session_id uuid NOT NULL REFERENCES firstscene.sessions(id) ON DELETE CASCADE,
 story_id text NOT NULL, operation_id uuid NOT NULL,
 code text NOT NULL CHECK(code IN ('helpful','distracting','too_fast','comfortable')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(session_id,operation_id)
);
CREATE INDEX feedback_session_day ON firstscene.feedback(session_id,story_id,created_at);
CREATE TABLE firstscene.rate_buckets (
 bucket_key bytea NOT NULL CHECK (octet_length(bucket_key)=32),
 window_start timestamptz NOT NULL, count integer NOT NULL CHECK(count>0),
 expires_at timestamptz NOT NULL, PRIMARY KEY(bucket_key,window_start)
);
CREATE INDEX rate_expiry ON firstscene.rate_buckets(expires_at);
REVOKE ALL ON ALL TABLES IN SCHEMA firstscene FROM PUBLIC;
-- Runtime grant is performed separately to a dedicated non-owner role.
-- It must NOT receive DDL, schema_migrations mutation, public API or BYPASSRLS privileges.
