const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;

// Neon (and most hosted Postgres) requires SSL.
// Locally without a DB_URL this block is never reached.
const sslConfig = connectionString ? { rejectUnauthorized: false } : false;

const pool = new Pool({
  connectionString,
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

module.exports = pool;
