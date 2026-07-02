const pool   = require('../db/pool');
const runner = require('../engines/runner');

const s = (schemaName) => `"${schemaName}"`;

async function generateSchedule(req, res) {
  const { schemaName } = req.agency;
  const { algorithm }  = req.body;

  if (!['greedy', 'cpsat', 'llm'].includes(algorithm)) {
    return res.status(400).json({ error: 'algorithm must be "greedy", "cpsat" or "llm"' });
  }

  try {
    // Only active workers go to the engine
    const workersResult = await pool.query(
      `SELECT w.id, w.role, w.max_weekly_hours,
              json_agg(json_build_object(
                'day', a.day_of_week,
                'from', to_char(a.from_time, 'HH24:MI'),
                'to',   to_char(a.to_time,   'HH24:MI')
              )) FILTER (WHERE a.id IS NOT NULL) AS availability
       FROM ${s(schemaName)}.workers w
       LEFT JOIN ${s(schemaName)}.availability a ON a.worker_id = w.id
       WHERE w.is_active = true
       GROUP BY w.id`
    );

    const shiftsResult = await pool.query(
      `SELECT id,
              shift_date::text                AS date,
              to_char(start_time, 'HH24:MI') AS start,
              to_char(end_time,   'HH24:MI') AS end,
              required_role, slots_needed, break_minutes
       FROM ${s(schemaName)}.shifts
       WHERE status != 'cancelled'
       ORDER BY shift_date, start_time`
    );

    const payload = {
      workers: workersResult.rows.map(w => ({
        id:           w.id,
        role:         w.role,
        max_hours:    parseFloat(w.max_weekly_hours),
        availability: w.availability || []
      })),
      shifts: shiftsResult.rows.map(sh => ({
        id:            sh.id,
        date:          sh.date,
        start:         sh.start,
        end:           sh.end,
        required_role: sh.required_role,
        slots_needed:  sh.slots_needed,
        break_minutes: sh.break_minutes
      }))
    };

    const engineResult = await runner.run(algorithm, payload);

    const client = await pool.connect();
    let scheduleId;
    try {
      await client.query('BEGIN');

      const schedRow = await client.query(
        `INSERT INTO ${s(schemaName)}.schedules (algorithm_used) VALUES ($1) RETURNING id`,
        [algorithm]
      );
      scheduleId = schedRow.rows[0].id;

      for (const a of engineResult.assignments) {
        await client.query(
          `INSERT INTO ${s(schemaName)}.assignments (schedule_id, shift_id, worker_id)
           VALUES ($1, $2, $3)`,
          [scheduleId, a.shift_id, a.worker_id]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.status(201).json({
      schedule_id: scheduleId,
      algorithm,
      assignments: engineResult.assignments,
      unfilled:    engineResult.unfilled,
      metrics:     engineResult.metrics
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Schedule generation failed', detail: err.message });
  }
}

async function getSchedule(req, res) {
  const { schemaName } = req.agency;
  try {
    const schedResult = await pool.query(
      `SELECT * FROM ${s(schemaName)}.schedules WHERE id = $1`,
      [req.params.id]
    );
    if (schedResult.rows.length === 0) return res.status(404).json({ error: 'Schedule not found' });

    const assignResult = await pool.query(
      `SELECT a.id, a.shift_id, a.worker_id, a.status AS assignment_status,
              sh.title, sh.shift_date::text,
              to_char(sh.start_time, 'HH24:MI') AS start_time,
              to_char(sh.end_time,   'HH24:MI') AS end_time,
              sh.required_role, sh.slots_needed,
              w.name AS worker_name, w.role AS worker_role
       FROM ${s(schemaName)}.assignments a
       JOIN ${s(schemaName)}.shifts  sh ON sh.id = a.shift_id
       JOIN ${s(schemaName)}.workers w  ON w.id  = a.worker_id
       WHERE a.schedule_id = $1
       ORDER BY sh.shift_date, sh.start_time`,
      [req.params.id]
    );

    res.json({ schedule: schedResult.rows[0], assignments: assignResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
}

async function getMetrics(req, res) {
  const { schemaName } = req.agency;
  try {
    const schedResult = await pool.query(
      `SELECT * FROM ${s(schemaName)}.schedules WHERE id = $1`,
      [req.params.id]
    );
    if (schedResult.rows.length === 0) return res.status(404).json({ error: 'Schedule not found' });

    // Total slots across all non-cancelled shifts
    const totalSlotsResult = await pool.query(
      `SELECT COALESCE(SUM(slots_needed), 0) AS total_slots FROM ${s(schemaName)}.shifts WHERE status != 'cancelled'`
    );

    // Slots filled by this schedule
    const filledResult = await pool.query(
      `SELECT COUNT(*) AS filled_slots FROM ${s(schemaName)}.assignments WHERE schedule_id = $1`,
      [req.params.id]
    );

    // Hours per worker for Gini
    const hoursResult = await pool.query(
      `SELECT a.worker_id,
              EXTRACT(EPOCH FROM (sh.end_time - sh.start_time)) / 3600 AS hours
       FROM ${s(schemaName)}.assignments a
       JOIN ${s(schemaName)}.shifts sh ON sh.id = a.shift_id
       WHERE a.schedule_id = $1`,
      [req.params.id]
    );

    const totalSlots  = parseInt(totalSlotsResult.rows[0].total_slots);
    const filledSlots = parseInt(filledResult.rows[0].filled_slots);
    const completeness = totalSlots > 0 ? (filledSlots / totalSlots) * 100 : 0;

    const hoursByWorker = {};
    for (const row of hoursResult.rows) {
      hoursByWorker[row.worker_id] = (hoursByWorker[row.worker_id] || 0) + parseFloat(row.hours);
    }
    const hours = Object.values(hoursByWorker).sort((a, b) => a - b);
    const gini  = computeGini(hours);

    res.json({
      schedule_id:   parseInt(req.params.id),
      algorithm:     schedResult.rows[0].algorithm_used,
      completeness:  Math.round(completeness * 10) / 10,
      gini_fairness: Math.round(gini * 1000) / 1000,
      filled_slots:  filledSlots,
      total_slots:   totalSlots
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute metrics' });
  }
}

function computeGini(sortedValues) {
  const n   = sortedValues.length;
  if (n === 0) return 0;
  const sum = sortedValues.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sortedValues[i];
  }
  return numerator / (n * sum);
}

module.exports = { generateSchedule, getSchedule, getMetrics };
