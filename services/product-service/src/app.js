const express = require('express');

// The app receives its data store as a parameter, so tests can pass a fake
// store and run without a real database.
function createApp(store) {
  const app = express();
  app.use(express.json());

  // Liveness: the process is up.
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  // Readiness: the service can reach its database and may receive traffic.
  app.get('/readyz', async (req, res) => {
    try {
      await store.ping();
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not ready' });
    }
  });

  app.get('/products', async (req, res) => {
    res.json(await store.list());
  });

  app.get('/products/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'invalid product id' });
    }
    const product = await store.get(id);
    if (!product) {
      return res.status(404).json({ error: 'product not found' });
    }
    res.json(product);
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

module.exports = { createApp };
