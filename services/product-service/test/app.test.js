const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

const PRODUCTS = [
  { id: 1, name: 'Keyboard', description: 'Keys', priceCents: 8900 },
  { id: 2, name: 'Mouse', description: 'Clicks', priceCents: 3500 },
];

function fakeStore({ healthy = true } = {}) {
  return {
    ping: async () => {
      if (!healthy) throw new Error('db down');
    },
    list: async () => PRODUCTS,
    get: async (id) => PRODUCTS.find((p) => p.id === id) || null,
  };
}

// Starts the app on a random free port, runs the test body, then stops it.
async function withServer(store, fn) {
  const server = createApp(store).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

test('GET /products returns the catalog', async () => {
  await withServer(fakeStore(), async (base) => {
    const res = await fetch(`${base}/products`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), PRODUCTS);
  });
});

test('GET /products/:id returns one product', async () => {
  await withServer(fakeStore(), async (base) => {
    const res = await fetch(`${base}/products/2`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).name, 'Mouse');
  });
});

test('GET /products/:id returns 404 for an unknown product', async () => {
  await withServer(fakeStore(), async (base) => {
    const res = await fetch(`${base}/products/99`);
    assert.equal(res.status, 404);
  });
});

test('GET /products/:id returns 400 for a non-numeric id', async () => {
  await withServer(fakeStore(), async (base) => {
    const res = await fetch(`${base}/products/abc`);
    assert.equal(res.status, 400);
  });
});

test('GET /readyz returns 503 when the database is unreachable', async () => {
  await withServer(fakeStore({ healthy: false }), async (base) => {
    const res = await fetch(`${base}/readyz`);
    assert.equal(res.status, 503);
  });
});
