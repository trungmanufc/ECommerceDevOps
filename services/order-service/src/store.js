const { Pool } = require('pg');

const COLUMNS = `id, user_id AS "userId", items, total_cents AS "totalCents", created_at AS "createdAt"`;

function createPgStore() {
  // Connection settings come from the standard PG* environment variables
  // (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
  const pool = new Pool();

  return {
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id          serial      PRIMARY KEY,
          user_id     text        NOT NULL,
          items       jsonb       NOT NULL,
          total_cents integer     NOT NULL,
          created_at  timestamptz NOT NULL DEFAULT now()
        )`);
      await pool.query('CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders (user_id)');
    },

    ping: () => pool.query('SELECT 1'),

    async create({ userId, items, totalCents }) {
      const { rows } = await pool.query(
        `INSERT INTO orders (user_id, items, total_cents)
         VALUES ($1, $2, $3)
         RETURNING ${COLUMNS}`,
        [userId, JSON.stringify(items), totalCents],
      );
      return rows[0];
    },

    async listByUser(userId) {
      const { rows } = await pool.query(
        `SELECT ${COLUMNS} FROM orders WHERE user_id = $1 ORDER BY id DESC`,
        [userId],
      );
      return rows;
    },

    close: () => pool.end(),
  };
}

module.exports = { createPgStore };
