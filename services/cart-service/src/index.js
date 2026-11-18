const { createApp } = require('./app');
const { createRedisStore } = require('./store');

const PORT = Number(process.env.PORT) || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function main() {
  const store = createRedisStore(REDIS_URL);
  // The Redis client keeps reconnecting by itself until Redis is reachable.
  await store.connect();

  const server = createApp(store).listen(PORT, () => {
    console.log(`cart-service listening on port ${PORT}`);
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
