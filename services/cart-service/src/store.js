const { createClient } = require('redis');

// Each cart is one Redis hash: key "cart:<userId>", field = product id,
// value = quantity.
const key = (userId) => `cart:${userId}`;

function createRedisStore(url) {
  const client = createClient({ url });
  client.on('error', (err) => console.error('redis error:', err.message));

  return {
    connect: () => client.connect(),
    ping: () => client.ping(),

    async getCart(userId) {
      const hash = await client.hGetAll(key(userId));
      return Object.entries(hash)
        .map(([productId, quantity]) => ({
          productId: Number(productId),
          quantity: Number(quantity),
        }))
        .sort((a, b) => a.productId - b.productId);
    },

    async addItem(userId, productId, quantity) {
      await client.hIncrBy(key(userId), String(productId), quantity);
    },

    async removeItem(userId, productId) {
      await client.hDel(key(userId), String(productId));
    },

    async clear(userId) {
      await client.del(key(userId));
    },

    close: () => client.quit(),
  };
}

module.exports = { createRedisStore };
