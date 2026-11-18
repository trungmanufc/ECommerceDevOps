const express = require('express');
const { buildOrder, UnknownProductError } = require('./order');
const { UpstreamError } = require('./clients');

const USER_ID_PATTERN = /^[\w-]{1,64}$/;
const isValidUserId = (value) => typeof value === 'string' && USER_ID_PATTERN.test(value);

// store:    saves and lists orders (PostgreSQL in production)
// cart:     client for cart-service
// products: client for product-service
// All three are passed in so tests can replace them with fakes.
function createApp({ store, cart, products }) {
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

  // Checkout: turn the user's cart into an order.
  app.post('/orders', async (req, res) => {
    const userId = req.body?.userId;
    if (!isValidUserId(userId)) {
      return res.status(400).json({ error: 'a valid userId is required' });
    }

    const cartItems = await cart.get(userId);
    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'cart is empty' });
    }

    // Prices are read from product-service, never trusted from the browser.
    const productList = await Promise.all(cartItems.map((item) => products.get(item.productId)));
    const { items, totalCents } = buildOrder(cartItems, productList);

    const order = await store.create({ userId, items, totalCents });
    await cart.clear(userId);
    res.status(201).json(order);
  });

  app.get('/orders', async (req, res) => {
    const { userId } = req.query;
    if (!isValidUserId(userId)) {
      return res.status(400).json({ error: 'a valid userId query parameter is required' });
    }
    res.json(await store.listByUser(userId));
  });

  app.use((err, req, res, next) => {
    if (err instanceof UnknownProductError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof UpstreamError) {
      console.error(err.message);
      return res.status(502).json({ error: 'a dependent service is unavailable, try again' });
    }
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

module.exports = { createApp };
