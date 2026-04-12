const fs   = require('fs');
const path = require('path');
const pool = require('./pool');

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _cm_migrations (
        id        SERIAL PRIMARY KEY,
        filename  VARCHAR(255) UNIQUE NOT NULL,
        run_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT id FROM _cm_migrations WHERE filename = $1',
        [file]
      );
      if (rows.length > 0) {
        console.log(`[DB] Migration already run: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`[DB] Running migration: ${file}`);
      await client.query(sql);
      await client.query('INSERT INTO _cm_migrations (filename) VALUES ($1)', [file]);
      console.log(`[DB] Migration complete: ${file}`);
    }
  } finally {
    client.release();
  }
}

module.exports = runMigrations;
