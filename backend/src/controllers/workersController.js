const pool = require('../db/pool');

const s = (schemaName) => `"${schemaName}"`;

async function getWorkers(req, res) {
  const { schemaName } = req.agency;
  try {
    const result = await pool.query(
      `SELECT w.*, json_agg(a.*) FILTER (WHERE a.id IS NOT NULL) AS availability
       FROM ${s(schemaName)}.workers w
       LEFT JOIN ${s(schemaName)}.availability a ON a.worker_id = w.id
       GROUP BY w.id ORDER BY w.id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
}

async function createWorker(req, res) {
  const { schemaName } = req.agency;
  const { name, email, phone, role, max_weekly_hours = 40 } = req.body;
  if (!name || !role) {
    return res.status(400).json({ error: 'name and role are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO ${s(schemaName)}.workers (name, email, phone, role, max_weekly_hours)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, email || null, phone || null, role, max_weekly_hours]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create worker' });
  }
}

async function updateWorker(req, res) {
  const { schemaName } = req.agency;
  const { name, email, phone, role, max_weekly_hours, is_active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE ${s(schemaName)}.workers
       SET name             = COALESCE($1, name),
           email            = COALESCE($2, email),
           phone            = COALESCE($3, phone),
           role             = COALESCE($4, role),
           max_weekly_hours = COALESCE($5, max_weekly_hours),
           is_active        = COALESCE($6, is_active)
       WHERE id = $7 RETURNING *`,
      [name, email, phone, role, max_weekly_hours, is_active, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update worker' });
  }
}

async function deleteWorker(req, res) {
  const { schemaName } = req.agency;
  try {
    const result = await pool.query(
      `DELETE FROM ${s(schemaName)}.workers WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    res.json({ deleted: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete worker' });
  }
}

async function addAvailability(req, res) {
  const { schemaName } = req.agency;
  const { day_of_week, from_time, to_time } = req.body;
  if (!day_of_week || !from_time || !to_time) {
    return res.status(400).json({ error: 'day_of_week, from_time and to_time are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO ${s(schemaName)}.availability (worker_id, day_of_week, from_time, to_time)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, day_of_week, from_time, to_time]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add availability' });
  }
}

module.exports = { getWorkers, createWorker, updateWorker, deleteWorker, addAvailability };
