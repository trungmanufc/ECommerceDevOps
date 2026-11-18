// HTTP clients for the other microservices. order-service never touches their
// databases; it only talks to them through their APIs.

const TIMEOUT_MS = 3000;

class UpstreamError extends Error {}

async function request(url, options) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new UpstreamError(`${url} unreachable: ${err.message}`);
  }
}

function createCartClient(baseUrl) {
  const cartUrl = (userId) => `${baseUrl}/cart/${encodeURIComponent(userId)}`;
  return {
    async get(userId) {
      const res = await request(cartUrl(userId));
      if (!res.ok) throw new UpstreamError(`cart-service responded ${res.status}`);
      return (await res.json()).items;
    },
    async clear(userId) {
      const res = await request(cartUrl(userId), { method: 'DELETE' });
      if (!res.ok) throw new UpstreamError(`cart-service responded ${res.status}`);
    },
  };
}

function createProductClient(baseUrl) {
  return {
    // Returns the product, or null if it does not exist.
    async get(productId) {
      const res = await request(`${baseUrl}/products/${productId}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new UpstreamError(`product-service responded ${res.status}`);
      return res.json();
    },
  };
}

module.exports = { createCartClient, createProductClient, UpstreamError };
