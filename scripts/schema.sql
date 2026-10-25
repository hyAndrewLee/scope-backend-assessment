-- Empty hosted database only. Run as owner:
-- psql "$OWNER_DATABASE_URL" -1 -v ON_ERROR_STOP=1 -v runtime_role=YOUR_APP_ROLE -f scripts/schema.sql
-- No DROP statements and no automatic migration of an existing application.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- #region Theaters and persona access

CREATE TABLE users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL CONSTRAINT users_role CHECK (role IN ('admin','viewer')),
  all_theaters boolean NOT NULL DEFAULT false
);

CREATE TABLE theaters (
  id text PRIMARY KEY,
  name text NOT NULL,
  location text NOT NULL,
  timezone text NOT NULL,
  revision integer NOT NULL DEFAULT 0 CONSTRAINT theaters_revision CHECK (revision >= 0)
);

CREATE TABLE user_theaters (
  user_id text NOT NULL REFERENCES users(id),
  theater_id text NOT NULL REFERENCES theaters(id),
  PRIMARY KEY(user_id,theater_id)
);
-- #endregion

-- #region Auditorium capabilities and movie catalog

CREATE TABLE auditoriums (
  id text PRIMARY KEY,
  theater_id text NOT NULL REFERENCES theaters(id),
  name text NOT NULL,
  supported_formats text[] NOT NULL CONSTRAINT auditoriums_formats
    CHECK (cardinality(supported_formats) > 0 AND supported_formats <@ ARRAY['2D','3D','IMAX']::text[]),
  CONSTRAINT auditoriums_theater_identity UNIQUE(theater_id,id),
  CONSTRAINT auditoriums_theater_name UNIQUE(theater_id,name)
);

CREATE TABLE movies (
  id text PRIMARY KEY,
  theater_id text NOT NULL REFERENCES theaters(id),
  title text NOT NULL CONSTRAINT movies_title CHECK (length(title) BETWEEN 1 AND 256),
  supported_formats text[] NOT NULL CONSTRAINT movies_formats
    CHECK (cardinality(supported_formats) > 0 AND supported_formats <@ ARRAY['2D','3D','IMAX']::text[]),
  movie_status text NOT NULL DEFAULT 'draft' CONSTRAINT movies_status
    CHECK (movie_status IN ('approved','draft','flagged','needs-review')),
  CONSTRAINT movies_theater_identity UNIQUE(theater_id,id)
);
CREATE INDEX movies_title_search ON movies USING gin(title gin_trgm_ops);
-- #endregion

-- #region Screenings and projection integrity

CREATE TABLE showtimes (
  id text PRIMARY KEY,
  theater_id text NOT NULL,
  movie_id text NOT NULL,
  partner_title text NOT NULL,
  auditorium_id text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  language text NOT NULL CONSTRAINT showtimes_language CHECK (language IN ('EN','KO','JA','FR')),
  format text NOT NULL CONSTRAINT showtimes_format CHECK (format IN ('2D','3D','IMAX')),
  rating text NOT NULL CONSTRAINT showtimes_rating CHECK (rating IN ('G','PG','PG-13','R','NC-17','NR')),
  partner_last_updated timestamptz NOT NULL,
  last_updated timestamptz NOT NULL,
  status text NOT NULL CONSTRAINT showtimes_status CHECK (status IN ('active','inactive','archived')),
  FOREIGN KEY(theater_id,movie_id) REFERENCES movies(theater_id,id),
  FOREIGN KEY(theater_id,auditorium_id) REFERENCES auditoriums(theater_id,id),
  CONSTRAINT showtimes_time_order CHECK (end_time > start_time),
  CONSTRAINT showtimes_names CHECK (length(partner_title) BETWEEN 1 AND 256)
);
CREATE UNIQUE INDEX showtimes_active_identity ON showtimes(theater_id,movie_id,start_time) WHERE status='active';
CREATE INDEX showtimes_theater_start ON showtimes(theater_id,start_time,id);

-- Backstop for every active screening write, including direct SQL.
CREATE FUNCTION check_projection_format() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1 FROM movies m JOIN auditoriums a ON a.theater_id=m.theater_id
    WHERE m.id=NEW.movie_id AND a.id=NEW.auditorium_id AND m.theater_id=NEW.theater_id
      AND NEW.format=ANY(m.supported_formats) AND NEW.format=ANY(a.supported_formats)
  ) THEN
    RAISE EXCEPTION 'Unsupported movie/auditorium format' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER showtimes_projection BEFORE INSERT OR UPDATE ON showtimes
  FOR EACH ROW EXECUTE FUNCTION check_projection_format();

-- #endregion

-- #region Runtime role access

-- Server connection only; no direct hosted data-API access.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE theaters ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_theaters ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoriums ENABLE ROW LEVEL SECURITY;
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE showtimes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON users,theaters,user_theaters,auditoriums,movies,showtimes FROM PUBLIC;
-- The runtime role must be a dedicated server role, never anon/authenticated.
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT,INSERT,UPDATE,DELETE ON users,theaters,user_theaters,auditoriums,movies,showtimes TO :"runtime_role";
CREATE POLICY server_access ON users TO :"runtime_role" USING (true) WITH CHECK (true);
CREATE POLICY server_access ON theaters TO :"runtime_role" USING (true) WITH CHECK (true);
CREATE POLICY server_access ON user_theaters TO :"runtime_role" USING (true) WITH CHECK (true);
CREATE POLICY server_access ON auditoriums TO :"runtime_role" USING (true) WITH CHECK (true);
CREATE POLICY server_access ON movies TO :"runtime_role" USING (true) WITH CHECK (true);
CREATE POLICY server_access ON showtimes TO :"runtime_role" USING (true) WITH CHECK (true);

-- #endregion
