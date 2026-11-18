const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

// In-memory replacement for the Redis store.
function fakeStore() {
  const carts = new Map();
  const cartOf = (userId) => {
    if (!carts.has(userId)) carts.set(userId, new Map());
    return carts.get(userId);
  };
  return {
    ping: async () => {},
    getCart: async (userId) =>
      [...cartOf(userId)].map(([productId, quantity]) => ({ productId, quantity })),
    addItem: async (userId, productId, quantity) => {
      const cart = cartOf(userId);
      cart.set(productId, (cart.get(productId) || 0) + quantity);
    },
    removeItem: async (userId, productId) => {
      cartOf(userId).delete(productId);
    },
    clear: async (userId) => {
      carts.delete(userId);
    },
  };
}

// Starts the app on a random free port, runs the test body, then stops it.
async function withServer(fn) {
  const server = createApp(fakeStore()).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

const postItem = (base, userId, body) =>
  fetch(`${base}/cart/${userId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('a new cart is empty', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/cart/alice`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { userId: 'alice', items: [] });
  });
});

test('adding the same product twice sums the quantity', async () => {
  await withServer(async (base) => {
    await postItem(base, 'alice', { productId: 1, quantity: 2 });
    const res = await postItem(base, 'alice', { productId: 1 });
    assert.equal(res.status, 201);
    assert.deepEqual((await res.json()).items, [{ productId: 1, quantity: 3 }]);
  });
});

test('carts are separate per user', async () => {
  await withServer(async (base) => {
    await postItem(base, 'alice', { productId: 1 });
    const res = await fetch(`${base}/cart/bob`);
    assert.deepEqual((await res.json()).items, []);
  });
});

test('invalid input is rejected', async () => {
  await withServer(async (base) => {
    assert.equal((await postItem(base, 'alice', { productId: 'x' })).status, 400);
    assert.equal((await postItem(base, 'alice', { productId: 1, quantity: 0 })).status, 400);
    assert.equal((await postItem(base, 'alice', { productId: 1, quantity: 1000 })).status, 400);
    assert.equal((await fetch(`${base}/cart/bad%20id`)).status, 400);
  });
});

test('removing an item and clearing the cart', async () => {
  await withServer(async (base) => {
    await postItem(base, 'alice', { productId: 1 });
    await postItem(base, 'alice', { productId: 2 });

    const removed = await fetch(`${base}/cart/alice/items/1`, { method: 'DELETE' });
    assert.deepEqual((await removed.json()).items, [{ productId: 2, quantity: 1 }]);

    const cleared = await fetch(`${base}/cart/alice`, { method: 'DELETE' });
    assert.equal(cleared.status, 204);
    assert.deepEqual((await (await fetch(`${base}/cart/alice`)).json()).items, []);
  });
});
