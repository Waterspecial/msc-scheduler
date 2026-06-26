const bcrypt  = require('bcryptjs');
const pool    = require('../db/pool');
const { provisionAgencySchema } = require('../db/provision');

async function register(req, res) {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }

  const slug       = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const schemaName = `agency_${slug}_${Date.now()}`;

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO public.agencies (name, email, password_hash, schema_name)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email`,
      [name, email.toLowerCase(), passwordHash, schemaName]
    );

    await provisionAgencySchema(schemaName);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      const field = err.detail?.includes('email') ? 'Email' : 'Agency name';
      return res.status(409).json({ error: `${field} already taken` });
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
}

module.exports = { register };
