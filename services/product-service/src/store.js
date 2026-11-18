const { Pool } = require('pg');
const seed = require('./seed');

const COLUMNS = 'id, name, description, price_cents AS "priceCents"';

function createPgStore() {
  // Connection settings come from the standard PG* environment variables
  // (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
  const pool = new Pool();

  return {
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
          id          integer PRIMARY KEY,
          name        text    NOT NULL,
          description text    NOT NULL,
          price_cents integer NOT NULL
        )`);
      // ON CONFLICT makes seeding safe when several replicas start together.
      for (const p of seed) {
        await pool.query(
          `INSERT INTO products (id, name, description, price_cents)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [p.id, p.name, p.description, p.priceCents],
        );
      }
    },

    ping: () => pool.query('SELECT 1'),

    async list() {
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM products ORDER BY id`);
      return rows;
    },

    async get(id) {
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM products WHERE id = $1`, [id]);
      return rows[0] || null;
    },

    close: () => pool.end(),
  };
}

module.exports = { createPgStore };
