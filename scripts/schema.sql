-- Empty hosted database only. Run as owner:
-- psql "$OWNER_DATABASE_URL" -1 -v ON_ERROR_STOP=1 -v runtime_role=YOUR_APP_ROLE -f scripts/schema.sql
-- No DROP statements and no automatic migration of an existing application.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE users (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL,
 role text NOT NULL CONSTRAINT users_role CHECK (role IN ('admin','viewer')),
 all_theaters boolean NOT NULL DEFAULT false
);
CREATE TABLE theaters (
 id text PRIMARY KEY, name text NOT NULL, location text NOT NULL, timezone text NOT NULL,
 revision integer NOT NULL DEFAULT 0 CONSTRAINT theaters_revision CHECK (revision >= 0)
);
CREATE TABLE user_theaters (
 user_id text NOT NULL REFERENCES users(id), theater_id text NOT NULL REFERENCES theaters(id),
 PRIMARY KEY(user_id,theater_id)
);
CREATE TABLE movies (
 id text PRIMARY KEY, theater_id text NOT NULL REFERENCES theaters(id),
 title text NOT NULL CONSTRAINT movies_title CHECK (length(title) BETWEEN 1 AND 256),
 movie_status text NOT NULL DEFAULT 'draft' CONSTRAINT movies_status CHECK (movie_status IN ('approved','draft','flagged','needs-review')),
 CONSTRAINT movies_theater_identity UNIQUE(theater_id,id)
);
CREATE INDEX movies_title_search ON movies USING gin(title gin_trgm_ops);
CREATE TABLE showtimes (
 id text PRIMARY KEY, theater_id text NOT NULL, movie_id text NOT NULL,
 partner_title text NOT NULL, auditorium text NOT NULL,
 start_time timestamptz NOT NULL, end_time timestamptz NOT NULL,
 language text NOT NULL CONSTRAINT showtimes_language CHECK (language IN ('EN','KO','JA','FR')),
 format text NOT NULL CONSTRAINT showtimes_format CHECK (format IN ('2D','3D','IMAX')),
 rating text NOT NULL CONSTRAINT showtimes_rating CHECK (rating IN ('G','PG','PG-13','R','NC-17','NR')),
 partner_last_updated timestamptz NOT NULL, last_updated timestamptz NOT NULL,
 status text NOT NULL CONSTRAINT showtimes_status CHECK (status IN ('active','inactive','archived')),
 FOREIGN KEY(theater_id,movie_id) REFERENCES movies(theater_id,id),
 CONSTRAINT showtimes_time_order CHECK (end_time > start_time),
 CONSTRAINT showtimes_names CHECK (length(partner_title) BETWEEN 1 AND 256 AND length(auditorium) BETWEEN 1 AND 128)
);
CREATE UNIQUE INDEX showtimes_active_identity ON showtimes(theater_id,movie_id,start_time) WHERE status='active';
CREATE INDEX showtimes_theater_start ON showtimes(theater_id,start_time,id);
-- Server connection only; no direct hosted data-API access.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE theaters ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_theaters ENABLE ROW LEVEL SECURITY;
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE showtimes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON users,theaters,user_theaters,movies,showtimes FROM PUBLIC;
-- The runtime role must be a dedicated server role, never anon/authenticated.
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT,INSERT,UPDATE,DELETE ON users,theaters,user_theaters,movies,showtimes TO :"runtime_role";
CREATE POLICY server_access ON users TO :"runtime_role" USING (true) WITH CHECK (true);
CREATE POLICY server_access ON theaters TO :"runtime_role" USING (true) WITH CHECK (true);
CREATE POLICY server_access ON user_theaters TO :"runtime_role" USING (true) WITH CHECK (true);
CREATE POLICY server_access ON movies TO :"runtime_role" USING (true) WITH CHECK (true);
CREATE POLICY server_access ON showtimes TO :"runtime_role" USING (true) WITH CHECK (true);
