const pool = require('./pool');

async function provisionAgencySchema(schemaName) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // agencies table lives in public schema — ensure email column exists
    await client.query(`
      ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS email TEXT UNIQUE
    `).catch(() => {});

    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".workers (
        id               SERIAL PRIMARY KEY,
        name             TEXT         NOT NULL,
        email            TEXT,
        phone            TEXT,
        role             TEXT         NOT NULL,
        max_weekly_hours NUMERIC(5,2) NOT NULL DEFAULT 40,
        is_active        BOOLEAN      NOT NULL DEFAULT true
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".availability (
        id          SERIAL PRIMARY KEY,
        worker_id   INTEGER NOT NULL REFERENCES "${schemaName}".workers(id) ON DELETE CASCADE,
        day_of_week TEXT    NOT NULL CHECK (day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
        from_time   TIME    NOT NULL,
        to_time     TIME    NOT NULL,
        CHECK (from_time < to_time)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".shifts (
        id            SERIAL PRIMARY KEY,
        title         TEXT    NOT NULL,
        shift_date    DATE    NOT NULL,
        start_time    TIME    NOT NULL,
        end_time      TIME    NOT NULL,
        required_role TEXT    NOT NULL,
        slots_needed  INTEGER NOT NULL DEFAULT 1 CHECK (slots_needed >= 1),
        break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
        status        TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','filled','cancelled')),
        CHECK (start_time < end_time)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".schedules (
        id             SERIAL PRIMARY KEY,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        algorithm_used TEXT        NOT NULL CHECK (algorithm_used IN ('greedy','cpsat'))
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".assignments (
        id          SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL REFERENCES "${schemaName}".schedules(id) ON DELETE CASCADE,
        shift_id    INTEGER NOT NULL REFERENCES "${schemaName}".shifts(id)    ON DELETE CASCADE,
        worker_id   INTEGER NOT NULL REFERENCES "${schemaName}".workers(id)   ON DELETE CASCADE,
        status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
        UNIQUE (schedule_id, shift_id, worker_id)
      )
    `);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { provisionAgencySchema };
