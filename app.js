/* Home Store Mini App */
const ICONS = {
  Kitchen: "🫙",
  Bedroom: "🛏️",
  Lighting: "💡",
  "Organization & storage": "📦",
};

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const state = {
  categories: [],
  products: [],
  filterCat: "all",
  query: "",
  cart: loadCart(),
  payment: "card",
  view: "catalog", // catalog | cart | checkout | product
  product: null,
};

function loadCart() {
  try {
    return JSON.parse(sessionStorage.getItem("homeStoreCart") || "{}");
  } catch {
    return {};
  }
}
function saveCart() {
  sessionStorage.setItem("homeStoreCart", JSON.stringify(state.cart));
}

function fmtPrice(v) {
  if (Math.abs(v - Math.round(v)) < 1e-9) return `${Math.round(v)} ₽`;
  return `${v.toFixed(2)} ₽`;
}

function haptic(kind, style) {
  try {
    const h = tg && tg.HapticFeedback;
    if (!h) return;
    if (kind === "impact") h.impactOccurred(style || "light");
    else if (kind === "notify") h.notificationOccurred(style || "success");
    else if (kind === "select") h.selectionChanged();
  } catch (_) {}
}

function applyTheme() {
  if (!tg || !tg.themeParams) return;
  const t = tg.themeParams;
  const root = document.documentElement;
  if (t.bg_color) root.style.setProperty("--bg", t.bg_color);
  if (t.secondary_bg_color) root.style.setProperty("--bg-elev", t.secondary_bg_color);
  if (t.text_color) root.style.setProperty("--text", t.text_color);
  if (t.hint_color) root.style.setProperty("--muted", t.hint_color);
  if (t.button_color) root.style.setProperty("--accent", t.button_color);
  if (t.link_color) root.style.setProperty("--accent-2", t.link_color);
}

function initTelegram() {
  if (!tg) {
    document.body.classList.add("browser");
    return;
  }
  tg.ready();
  tg.expand();
  applyTheme();
  if (tg.onEvent) {
    tg.onEvent("themeChanged", applyTheme);
    tg.onEvent("mainButtonClicked", onMainButton);
  } else if (tg.MainButton && tg.MainButton.onClick) {
    tg.MainButton.onClick(onMainButton);
  }
}

function cartCount() {
  return Object.values(state.cart).reduce((s, q) => s + q, 0);
}
function cartItems() {
  return Object.entries(state.cart)
    .map(([id, qty]) => {
      const p = state.products.find((x) => String(x.id) === String(id));
      return p ? { ...p, qty } : null;
    })
    .filter(Boolean);
}
function cartTotal() {
  return cartItems().reduce((s, it) => s + it.qty * it.price, 0);
}

function setCart(id, qty) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  const next = Math.max(0, Math.min(qty, p.stock));
  if (next <= 0) delete state.cart[id];
  else state.cart[id] = next;
  saveCart();
  render();
}

function addToCart(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p || p.stock <= 0) return;
  const cur = state.cart[id] || 0;
  if (cur >= p.stock) return;
  setCart(id, cur + 1);
  haptic("impact", "light");
}

function visibleProducts() {
  const q = state.query.trim().toLowerCase();
  return state.products.filter((p) => {
    const inCat = state.filterCat === "all" || String(p.category_id) === String(state.filterCat);
    const inQ =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q);
    return inCat && inQ;
  });
}

function displayName(name) {
  return String(name || "").replace(/^\[SAMPLE\]\s*/i, "");
}

function renderHeader() {
  const n = cartCount();
  const badge = document.getElementById("cartBadge");
  badge.textContent = String(n);
  badge.classList.toggle("show", n > 0);
}

function renderTabs() {
  const el = document.getElementById("tabs");
  const cats = [{ id: "all", name: "All" }, ...state.categories];
  el.innerHTML = cats
    .map(
      (c) =>
        `<button class="tab${String(state.filterCat) === String(c.id) ? " active" : ""}" data-cat="${c.id}">${escapeHtml(c.name)}</button>`
    )
    .join("");
}

function renderGrid() {
  const el = document.getElementById("grid");
  const list = visibleProducts();
  if (!list.length) {
    el.innerHTML = `<div class="empty">No products match your search.</div>`;
    return;
  }
  el.innerHTML = list
    .map((p) => {
      const out = p.stock <= 0;
      return `<article class="card" data-open="${p.id}">
        <div class="card-art">${ICONS[p.category] || "🏠"}</div>
        <div class="card-body">
          <div class="card-cat">${escapeHtml(p.category)}</div>
          <div class="card-name">${escapeHtml(displayName(p.name))}</div>
          <div class="card-meta">
            <span class="price">${fmtPrice(p.price)}</span>
            <span class="stock${out ? " out" : ""}">${out ? "Out of stock" : p.stock + " in stock"}</span>
          </div>
          <button class="add-mini" data-add="${p.id}" ${out ? "disabled" : ""}>${out ? "Unavailable" : "Add"}</button>
        </div>
      </article>`;
    })
    .join("");
}

function renderProductSheet() {
  const p = state.product;
  const sheet = document.getElementById("productSheet");
  const overlay = document.getElementById("overlay");
  if (state.view !== "product" || !p) {
    sheet.classList.remove("show");
    if (state.view === "catalog") overlay.classList.remove("show");
    return;
  }
  const out = p.stock <= 0;
  const inCart = state.cart[p.id] || 0;
  document.getElementById("productInner").innerHTML = `
    <div class="card-art" style="height:150px;border-radius:16px;margin-bottom:12px">${ICONS[p.category] || "🏠"}</div>
    <div class="card-cat">${escapeHtml(p.category)}</div>
    <h2>${escapeHtml(displayName(p.name))}</h2>
    <p class="sheet-desc">${escapeHtml(p.description || "")}</p>
    <div class="sheet-row">
      <span class="price">${fmtPrice(p.price)}</span>
      <span class="stock${out ? " out" : ""}">${out ? "Out of stock" : p.stock + " in stock"}</span>
    </div>
    <button class="primary" data-add="${p.id}" ${out || inCart >= p.stock ? "disabled" : ""}>
      ${out ? "Unavailable" : inCart ? "Add another" : "Add to cart"}
    </button>
  `;
  sheet.classList.add("show");
  overlay.classList.add("show");
}

function renderCartSheet() {
  const sheet = document.getElementById("cartSheet");
  const overlay = document.getElementById("overlay");
  if (state.view !== "cart" && state.view !== "checkout") {
    sheet.classList.remove("show");
    return;
  }
  const items = cartItems();
  let body;
  if (!items.length) {
    body = `<p class="empty">Your cart is empty.</p>`;
  } else {
    body =
      items
        .map(
          (it) => `<div class="cart-item">
            <div>
              <div class="card-name">${escapeHtml(displayName(it.name))}</div>
              <div class="price">${fmtPrice(it.price)} × ${it.qty} = ${fmtPrice(it.price * it.qty)}</div>
            </div>
            <div class="qty">
              <button data-qty="${it.id}" data-d="-1">−</button>
              <span>${it.qty}</span>
              <button data-qty="${it.id}" data-d="1">+</button>
            </div>
          </div>`
        )
        .join("") +
      `<div class="cart-total"><span>Total</span><span>${fmtPrice(cartTotal())}</span></div>`;
  }
  document.getElementById("cartList").innerHTML = body;
  const form = document.getElementById("checkoutForm");
  form.hidden = state.view !== "checkout";
  document.getElementById("cartTitle").textContent = state.view === "checkout" ? "Checkout" : "Cart";
  document.querySelectorAll(".pay-opt").forEach((b) => {
    b.classList.toggle("active", b.dataset.pay === state.payment);
  });
  sheet.classList.add("show");
  overlay.classList.add("show");
}

function updateMainButton() {
  if (!tg || !tg.MainButton) return;
  const mb = tg.MainButton;
  const n = cartCount();
  const total = fmtPrice(cartTotal());
  if (state.view === "checkout" && n > 0) {
    mb.setText(`Place order · ${total}`);
    mb.show();
    mb.enable();
  } else if (state.view === "cart" && n > 0) {
    mb.setText(`Checkout · ${total}`);
    mb.show();
    mb.enable();
  } else if (n > 0 && (state.view === "catalog" || state.view === "product")) {
    mb.setText(`View cart · ${total}`);
    mb.show();
    mb.enable();
  } else {
    mb.hide();
  }
  if (mb.setParams) {
    mb.setParams({ color: "#c4844a", text_color: "#1a120c" });
  }
}

function onMainButton() {
  haptic("impact", "medium");
  if (state.view === "checkout") submitOrder();
  else if (state.view === "cart") {
    state.view = "checkout";
    render();
  } else {
    state.view = "cart";
    render();
  }
}

function submitOrder() {
  const name = document.getElementById("fName").value.trim();
  const phone = document.getElementById("fPhone").value.trim();
  const address = document.getElementById("fAddress").value.trim();
  const err = document.getElementById("formError");
  const digits = phone.replace(/[^\d+]/g, "");
  if (name.length < 2) {
    err.textContent = "Please enter your name.";
    return;
  }
  if (digits.length < 7) {
    err.textContent = "Please enter a valid phone number.";
    return;
  }
  if (address.length < 5) {
    err.textContent = "Please enter your delivery address.";
    return;
  }
  const items = cartItems();
  if (!items.length) {
    err.textContent = "Your cart is empty.";
    return;
  }
  err.textContent = "";
  const payload = {
    name,
    phone,
    address,
    payment: state.payment,
    items: items.map((it) => ({ id: it.id, qty: it.qty })),
  };
  const raw = JSON.stringify(payload);
  haptic("notify", "success");
  if (tg && typeof tg.sendData === "function") {
    try {
      tg.sendData(raw);
      if (tg.close) tg.close();
      return;
    } catch (e) {
      err.textContent = "Could not send the order to Telegram. Open this shop from the bot.";
    }
  } else {
    err.textContent = "Open this shop from the Telegram bot to place an order.";
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render() {
  renderHeader();
  renderTabs();
  renderGrid();
  renderProductSheet();
  renderCartSheet();
  updateMainButton();
}

function closeSheets() {
  state.view = "catalog";
  state.product = null;
  render();
}

function bind() {
  document.getElementById("search").addEventListener("input", (e) => {
    state.query = e.target.value;
    renderGrid();
  });
  document.getElementById("tabs").addEventListener("click", (e) => {
    const t = e.target.closest("[data-cat]");
    if (!t) return;
    state.filterCat = t.dataset.cat;
    haptic("select");
    render();
  });
  document.getElementById("grid").addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) {
      e.preventDefault();
      e.stopPropagation();
      addToCart(Number(add.dataset.add));
      return;
    }
    const card = e.target.closest("[data-open]");
    if (card) {
      state.product = state.products.find((p) => String(p.id) === card.dataset.open);
      state.view = "product";
      haptic("impact", "light");
      render();
    }
  });
  document.getElementById("cartBtn").addEventListener("click", () => {
    state.view = "cart";
    haptic("impact", "light");
    render();
  });
  document.getElementById("overlay").addEventListener("click", closeSheets);
  document.getElementById("productInner").addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) addToCart(Number(add.dataset.add));
  });
  document.getElementById("cartList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-qty]");
    if (!b) return;
    const id = Number(b.dataset.qty);
    const d = Number(b.dataset.d);
    setCart(id, (state.cart[id] || 0) + d);
    haptic("impact", "light");
  });
  document.getElementById("payRow").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pay]");
    if (!b) return;
    state.payment = b.dataset.pay;
    haptic("select");
    renderCartSheet();
  });
  document.getElementById("placeFallback").addEventListener("click", submitOrder);
}

async function main() {
  initTelegram();
  bind();
  try {
    const res = await fetch("products.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load catalogue");
    const data = await res.json();
    state.categories = data.categories || [];
    state.products = data.products || [];
    render();
  } catch (e) {
    document.getElementById("grid").innerHTML = `<div class="error">Could not load products.json.</div>`;
  }
}

main();
