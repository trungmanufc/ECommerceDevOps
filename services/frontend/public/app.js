// There is no login in this demo: each browser gets a random guest id, kept in
// localStorage so the cart and orders survive a page reload.
function getUserId() {
  let id = null;
  try {
    id = localStorage.getItem('userId');
  } catch {}
  if (!id) {
    id = `guest-${Math.random().toString(36).slice(2, 10)}`;
    try {
      localStorage.setItem('userId', id);
    } catch {}
  }
  return id;
}

const userId = getUserId();
let products = new Map();

const $ = (selector) => document.querySelector(selector);
const money = (cents) => `$${(cents / 100).toFixed(2)}`;

// Small helper to build DOM nodes. Text is always set with textContent, so
// data from the API can never be interpreted as HTML.
function el(tag, { text, className, onClick } = {}, children = []) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  if (onClick) node.addEventListener('click', onClick);
  node.append(...children);
  return node;
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

function showMessage(text, isError = false) {
  const box = $('#message');
  box.textContent = text;
  box.classList.toggle('error', isError);
  box.hidden = false;
}

// Runs an action and shows any failure to the user instead of hiding it.
async function run(action) {
  try {
    $('#message').hidden = true;
    await action();
  } catch (err) {
    showMessage(err.message, true);
  }
}

function renderProducts() {
  const cards = [...products.values()].map((p) =>
    el('article', { className: 'card' }, [
      el('h3', { text: p.name }),
      el('p', { text: p.description }),
      el('span', { text: money(p.priceCents), className: 'price' }),
      el('button', { text: 'Add to cart', onClick: () => run(() => addToCart(p.id)) }),
    ]),
  );
  $('#products').replaceChildren(...cards);
}

function renderCart(items) {
  let total = 0;
  const rows = items.map((item) => {
    const product = products.get(item.productId);
    const name = product ? product.name : `Product #${item.productId}`;
    const lineTotal = product ? product.priceCents * item.quantity : 0;
    total += lineTotal;
    return el('li', {}, [
      el('span', { text: `${item.quantity} × ${name}` }),
      el('span', {}, [
        el('span', { text: `${money(lineTotal)} ` }),
        el('button', {
          text: 'Remove',
          className: 'link',
          onClick: () => run(() => removeFromCart(item.productId)),
        }),
      ]),
    ]);
  });

  if (rows.length === 0) {
    rows.push(el('li', { text: 'Your cart is empty.', className: 'empty' }));
  }
  $('#cart').replaceChildren(...rows);
  $('#cart-total').textContent = money(total);
  $('#checkout').disabled = items.length === 0;
}

function renderOrders(orders) {
  const rows = orders.map((order) => {
    const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
    return el('li', {}, [
      el('span', { text: `Order #${order.id} · ${count} item${count === 1 ? '' : 's'}` }),
      el('strong', { text: money(order.totalCents) }),
    ]);
  });
  if (rows.length === 0) {
    rows.push(el('li', { text: 'No orders yet.', className: 'empty' }));
  }
  $('#orders').replaceChildren(...rows);
}

async function loadProducts() {
  const list = await api('/products');
  products = new Map(list.map((p) => [p.id, p]));
  renderProducts();
}

async function loadCart() {
  const cart = await api(`/cart/${userId}`);
  renderCart(cart.items);
}

async function loadOrders() {
  renderOrders(await api(`/orders?userId=${encodeURIComponent(userId)}`));
}

async function addToCart(productId) {
  const cart = await api(`/cart/${userId}/items`, {
    method: 'POST',
    body: JSON.stringify({ productId, quantity: 1 }),
  });
  renderCart(cart.items);
}

async function removeFromCart(productId) {
  const cart = await api(`/cart/${userId}/items/${productId}`, { method: 'DELETE' });
  renderCart(cart.items);
}

async function checkout() {
  const order = await api('/orders', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  showMessage(`Order #${order.id} placed: ${money(order.totalCents)}`);
  await Promise.all([loadCart(), loadOrders()]);
}

$('#user').textContent = `Signed in as ${userId}`;
$('#checkout').addEventListener('click', () => run(checkout));

// Each section loads independently, so one unavailable service does not blank
// the whole page.
run(async () => {
  await loadProducts();
  await loadCart();
});
run(loadOrders);
