const pool = require('../db/pool');

const s = (schemaName) => `"${schemaName}"`;

async function getShifts(req, res) {
  const { schemaName } = req.agency;
  try {
    const result = await pool.query(
      `SELECT id, title, shift_date::text, start_time::text, end_time::text,
              required_role, slots_needed, break_minutes, status
       FROM ${s(schemaName)}.shifts ORDER BY shift_date, start_time`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
}

async function createShift(req, res) {
  const { schemaName } = req.agency;
  const { title, shift_date, start_time, end_time, required_role,
          slots_needed = 1, break_minutes = 0, status = 'draft' } = req.body;

  if (!title || !shift_date || !start_time || !end_time || !required_role) {
    return res.status(400).json({ error: 'title, shift_date, start_time, end_time and required_role are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO ${s(schemaName)}.shifts
         (title, shift_date, start_time, end_time, required_role, slots_needed, break_minutes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, shift_date, start_time, end_time, required_role, slots_needed, break_minutes, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create shift' });
  }
}

async function updateShift(req, res) {
  const { schemaName } = req.agency;
  const { title, shift_date, start_time, end_time, required_role,
          slots_needed, break_minutes, status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE ${s(schemaName)}.shifts
       SET title         = COALESCE($1, title),
           shift_date    = COALESCE($2, shift_date),
           start_time    = COALESCE($3, start_time),
           end_time      = COALESCE($4, end_time),
           required_role = COALESCE($5, required_role),
           slots_needed  = COALESCE($6, slots_needed),
           break_minutes = COALESCE($7, break_minutes),
           status        = COALESCE($8, status)
       WHERE id = $9 RETURNING *`,
      [title, shift_date, start_time, end_time, required_role,
       slots_needed, break_minutes, status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update shift' });
  }
}

async function deleteShift(req, res) {
  const { schemaName } = req.agency;
  try {
    const result = await pool.query(
      `DELETE FROM ${s(schemaName)}.shifts WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });
    res.json({ deleted: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete shift' });
  }
}

module.exports = { getShifts, createShift, updateShift, deleteShift };
