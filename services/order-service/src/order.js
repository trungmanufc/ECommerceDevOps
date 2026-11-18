// Pure business logic, kept free of HTTP and database code so it is easy to test.

class UnknownProductError extends Error {
  constructor(productId) {
    super(`product ${productId} no longer exists`);
    this.productId = productId;
  }
}

// cartItems: [{ productId, quantity }]
// products:  [{ id, name, priceCents }]
// Returns the order lines with the price at the time of purchase, and the total.
function buildOrder(cartItems, products) {
  const byId = new Map(products.filter(Boolean).map((p) => [p.id, p]));

  const items = cartItems.map(({ productId, quantity }) => {
    const product = byId.get(productId);
    if (!product) throw new UnknownProductError(productId);
    return {
      productId,
      name: product.name,
      priceCents: product.priceCents,
      quantity,
    };
  });

  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  return { items, totalCents };
}

module.exports = { buildOrder, UnknownProductError };
