const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { UpstreamError } = require('../src/clients');

const PRODUCTS = {
  1: { id: 1, name: 'Keyboard', priceCents: 8900 },
  2: { id: 2, name: 'Mouse', priceCents: 3500 },
};

// Fakes for the database and the two other services.
function fakes(cartItems) {
  const orders = [];
  const state = { cartCleared: false };
  return {
    state,
    store: {
      ping: async () => {},
      create: async (order) => {
        const saved = { id: orders.length + 1, ...order };
        orders.push(saved);
        return saved;
      },
      listByUser: async (userId) => orders.filter((o) => o.userId === userId),
    },
    cart: {
      get: async () => cartItems,
      clear: async () => {
        state.cartCleared = true;
      },
    },
    products: {
      get: async (id) => PRODUCTS[id] || null,
    },
  };
}

// Starts the app on a random free port, runs the test body, then stops it.
async function withServer(deps, fn) {
  const server = createApp(deps).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

const checkout = (base, body) =>
  fetch(`${base}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('checkout creates an order from the cart and clears the cart', async () => {
  const deps = fakes([
    { productId: 1, quantity: 1 },
    { productId: 2, quantity: 2 },
  ]);
  await withServer(deps, async (base) => {
    const res = await checkout(base, { userId: 'alice' });
    assert.equal(res.status, 201);

    const order = await res.json();
    assert.equal(order.totalCents, 8900 + 2 * 3500);
    assert.equal(order.items.length, 2);
    assert.equal(deps.state.cartCleared, true);

    const history = await (await fetch(`${base}/orders?userId=alice`)).json();
    assert.equal(history.length, 1);
  });
});

test('checkout with an empty cart returns 400', async () => {
  await withServer(fakes([]), async (base) => {
    const res = await checkout(base, { userId: 'alice' });
    assert.equal(res.status, 400);
  });
});

test('checkout without a userId returns 400', async () => {
  await withServer(fakes([]), async (base) => {
    assert.equal((await checkout(base, {})).status, 400);
    assert.equal((await fetch(`${base}/orders`)).status, 400);
  });
});

test('checkout with a product that no longer exists returns 400 and keeps the cart', async () => {
  const deps = fakes([{ productId: 99, quantity: 1 }]);
  await withServer(deps, async (base) => {
    const res = await checkout(base, { userId: 'alice' });
    assert.equal(res.status, 400);
    assert.equal(deps.state.cartCleared, false);
  });
});

test('checkout returns 502 when cart-service is down', async () => {
  const deps = fakes([]);
  deps.cart.get = async () => {
    throw new UpstreamError('cart-service unreachable');
  };
  await withServer(deps, async (base) => {
    const res = await checkout(base, { userId: 'alice' });
    assert.equal(res.status, 502);
  });
});
