-- Public schema: one row per registered agency
CREATE TABLE IF NOT EXISTS public.agencies (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  schema_name   TEXT        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-agency tables are created by provision.js inside each agency's own schema.
-- The SQL below is templated: replace :schema with the actual schema name.

-- :schema.workers
-- Each worker belongs to exactly one agency (implied by schema isolation).
CREATE TABLE IF NOT EXISTS :schema.workers (
  id              SERIAL PRIMARY KEY,
  name            TEXT    NOT NULL,
  role            TEXT    NOT NULL,
  max_weekly_hours NUMERIC(5,2) NOT NULL DEFAULT 40
);

-- :schema.availability
-- One row per availability window; a worker may have several per week.
CREATE TABLE IF NOT EXISTS :schema.availability (
  id          SERIAL PRIMARY KEY,
  worker_id   INTEGER NOT NULL REFERENCES :schema.workers(id) ON DELETE CASCADE,
  day_of_week TEXT    NOT NULL CHECK (day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  from_time   TIME    NOT NULL,
  to_time     TIME    NOT NULL,
  CHECK (from_time < to_time)
);

-- :schema.shifts
CREATE TABLE IF NOT EXISTS :schema.shifts (
  id            SERIAL PRIMARY KEY,
  title         TEXT    NOT NULL,
  shift_date    DATE    NOT NULL,
  start_time    TIME    NOT NULL,
  end_time      TIME    NOT NULL,
  required_role TEXT    NOT NULL,
  CHECK (start_time < end_time)
);

-- :schema.schedules
CREATE TABLE IF NOT EXISTS :schema.schedules (
  id             SERIAL PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  algorithm_used TEXT        NOT NULL CHECK (algorithm_used IN ('greedy','cpsat'))
);

-- :schema.assignments
CREATE TABLE IF NOT EXISTS :schema.assignments (
  id          SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES :schema.schedules(id) ON DELETE CASCADE,
  shift_id    INTEGER NOT NULL REFERENCES :schema.shifts(id)    ON DELETE CASCADE,
  worker_id   INTEGER NOT NULL REFERENCES :schema.workers(id)   ON DELETE CASCADE,
  UNIQUE (schedule_id, shift_id)
);
