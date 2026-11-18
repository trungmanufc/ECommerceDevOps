const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrder, UnknownProductError } = require('../src/order');

const KEYBOARD = { id: 1, name: 'Keyboard', priceCents: 8900 };
const MOUSE = { id: 2, name: 'Mouse', priceCents: 3500 };

test('buildOrder computes line prices and the total', () => {
  const cart = [
    { productId: 1, quantity: 2 },
    { productId: 2, quantity: 1 },
  ];
  const { items, totalCents } = buildOrder(cart, [KEYBOARD, MOUSE]);

  assert.equal(totalCents, 2 * 8900 + 3500);
  assert.deepEqual(items[0], { productId: 1, name: 'Keyboard', priceCents: 8900, quantity: 2 });
});

test('buildOrder rejects a cart item whose product no longer exists', () => {
  const cart = [{ productId: 7, quantity: 1 }];
  assert.throws(() => buildOrder(cart, [null]), UnknownProductError);
});
