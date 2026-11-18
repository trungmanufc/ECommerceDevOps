const express = require('express');

const USER_ID_PATTERN = /^[\w-]{1,64}$/;
const MAX_QUANTITY = 99;

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

// The app receives its data store as a parameter, so tests can pass a fake
// store and run without a real Redis.
function createApp(store) {
  const app = express();
  app.use(express.json());

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  app.get('/readyz', async (req, res) => {
    try {
      await store.ping();
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not ready' });
    }
  });

  // Reject malformed user ids once, for every /cart/:userId route.
  app.param('userId', (req, res, next, userId) => {
    if (!USER_ID_PATTERN.test(userId)) {
      return res.status(400).json({ error: 'invalid user id' });
    }
    next();
  });

  const cartResponse = async (userId) => ({ userId, items: await store.getCart(userId) });

  app.get('/cart/:userId', async (req, res) => {
    res.json(await cartResponse(req.params.userId));
  });

  app.post('/cart/:userId/items', async (req, res) => {
    const { productId, quantity = 1 } = req.body || {};
    if (!isPositiveInt(productId)) {
      return res.status(400).json({ error: 'productId must be a positive integer' });
    }
    if (!isPositiveInt(quantity) || quantity > MAX_QUANTITY) {
      return res.status(400).json({ error: `quantity must be between 1 and ${MAX_QUANTITY}` });
    }
    await store.addItem(req.params.userId, productId, quantity);
    res.status(201).json(await cartResponse(req.params.userId));
  });

  app.delete('/cart/:userId/items/:productId', async (req, res) => {
    const productId = Number(req.params.productId);
    if (!isPositiveInt(productId)) {
      return res.status(400).json({ error: 'invalid product id' });
    }
    await store.removeItem(req.params.userId, productId);
    res.json(await cartResponse(req.params.userId));
  });

  app.delete('/cart/:userId', async (req, res) => {
    await store.clear(req.params.userId);
    res.status(204).end();
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

module.exports = { createApp };
