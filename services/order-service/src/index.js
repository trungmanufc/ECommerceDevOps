const { createApp } = require('./app');
const { createPgStore } = require('./store');
const { createCartClient, createProductClient } = require('./clients');

const PORT = Number(process.env.PORT) || 3000;
const CART_SERVICE_URL = process.env.CART_SERVICE_URL || 'http://localhost:3002';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3001';

// The database may still be starting when this container starts, so retry
// instead of crashing on the first failed connection.
async function retry(fn, label, attempts = 30, delayMs = 2000) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      console.log(`${label} not ready (${err.message}), retry ${i}/${attempts}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  const store = createPgStore();
  await retry(() => store.init(), 'postgres');

  const app = createApp({
    store,
    cart: createCartClient(CART_SERVICE_URL),
    products: createProductClient(PRODUCT_SERVICE_URL),
  });

  const server = app.listen(PORT, () => {
    console.log(`order-service listening on port ${PORT}`);
  });

  // Kubernetes sends SIGTERM before removing a pod: finish in-flight requests,
  // then exit.
  const shutdown = () => server.close(() => store.close().finally(() => process.exit(0)));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('startup failed:', err);
  process.exit(1);
});
