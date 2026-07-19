/* preview-cart.js — client-side cart for the STATIC DEMO only.
   In the real Shopify theme, theme.js + Shopify's /cart handle this for real.
   Buttons here are wired so you can click through the whole store. */
(function () {
  "use strict";
  var KEY = "rv_cart";
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var money = function (p) { return "£" + (p / 100).toFixed(2); };

  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function write(c) { localStorage.setItem(KEY, JSON.stringify(c)); updateCount(); }
  function count() { var c = read(), n = 0; for (var k in c) n += c[k].qty; return n; }
  function subtotal() { var c = read(), s = 0; for (var k in c) s += c[k].qty * c[k].price; return s; }

  function updateCount() {
    var n = count();
    $$("[data-count]").forEach(function (el) { el.textContent = n; el.setAttribute("data-count", n); });
  }

  /* toast */
  var toast = $("[data-rv-toast]");
  var tt;
  function showToast(html) {
    if (!toast) { toast = document.createElement("div"); toast.className = "rv-toast"; toast.setAttribute("data-rv-toast", ""); document.body.appendChild(toast); }
    toast.innerHTML = html;
    toast.classList.add("is-open");
    clearTimeout(tt);
    tt = setTimeout(function () { toast.classList.remove("is-open"); }, 3400);
  }

  function add(item, qty) {
    var c = read();
    if (c[item.id]) c[item.id].qty += qty; else { item.qty = qty; c[item.id] = item; }
    write(c);
  }
  function setQty(id, qty) {
    var c = read();
    if (!c[id]) return;
    if (qty <= 0) delete c[id]; else c[id].qty = qty;
    write(c);
    renderCart();
  }

  /* bind add / buy buttons */
  function itemFrom(btn) {
    var qtyInput = $("[data-rv-qty] input");
    var qty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;
    return {
      item: {
        id: btn.getAttribute("data-id"),
        title: btn.getAttribute("data-title"),
        price: parseInt(btn.getAttribute("data-price"), 10),
        icon: btn.getAttribute("data-icon") || "📕",
        grad: btn.getAttribute("data-grad") || "",
        author: btn.getAttribute("data-author") || ""
      },
      qty: qty
    };
  }
  document.addEventListener("click", function (e) {
    var addBtn = e.target.closest("[data-add]");
    var buyBtn = e.target.closest("[data-buy]");
    if (addBtn) {
      e.preventDefault();
      var a = itemFrom(addBtn);
      add(a.item, a.qty);
      showToast('⚔ <b>' + a.item.title + '</b> added · <a href="/vaults/cart.html" style="color:var(--amber);text-decoration:underline">View vault →</a>');
    } else if (buyBtn) {
      e.preventDefault();
      var b = itemFrom(buyBtn);
      add(b.item, b.qty);
      window.location.href = "/vaults/cart.html";
    }
  });

  /* cart page render */
  function renderCart() {
    var root = $("[data-cart-root]");
    if (!root) return;
    var c = read();
    var ids = Object.keys(c);
    if (!ids.length) {
      root.innerHTML =
        '<div class="rv-empty"><div class="ic">🗝️</div><h2 style="font-size:40px;margin:14px 0">Your vault is empty</h2>' +
        '<p class="rv-sub" style="margin:0 auto 22px">No weapons armed yet. Go claim your firepower.</p>' +
        '<a class="rv-cta primary" href="/vaults/">Browse the arsenal →</a></div>';
      return;
    }
    var lines = ids.map(function (id) {
      var i = c[id];
      return '<div class="rv-line">' +
        '<div class="rv-line__cover" style="background:' + i.grad + '">' + i.icon + '</div>' +
        '<div><h3>' + i.title + '</h3>' + (i.author ? '<div class="rv-line__by">by ' + i.author + '</div>' : '') +
          '<div class="rv-qty" data-rv-line-qty="' + id + '" style="margin-top:8px"><button data-dir="down" aria-label="Decrease">−</button><input value="' + i.qty + '" readonly><button data-dir="up" aria-label="Increase">+</button></div>' +
          '<a href="#" class="rv-line__remove" data-remove="' + id + '">Remove</a></div>' +
        '<div class="rv-line__price">' + money(i.price * i.qty) + '</div>' +
        '</div>';
    }).join("");
    root.innerHTML =
      '<div class="rv-cart"><div class="rv-cart__items">' + lines + '</div>' +
      '<aside class="rv-summary"><h2>Order summary</h2>' +
      '<div class="rv-summary__row"><span>Subtotal</span><span>' + money(subtotal()) + '</span></div>' +
      '<div class="rv-summary__row"><span>Delivery</span><span style="color:var(--ok)">Instant · Free</span></div>' +
      '<div class="rv-summary__row total"><span>Total</span><b>' + money(subtotal()) + '</b></div>' +
      '<button class="rv-cta primary block" style="margin-top:18px" data-checkout>Secure checkout →</button>' +
      '<p class="rv-sub" style="font-size:13px;margin-top:14px">🔒 Instant PDF delivery · 30-day refund · Stripe secured</p>' +
      '<a class="rv-add" style="display:block;text-align:center;margin-top:12px" href="/vaults/">+ Keep shopping</a>' +
      '</aside></div>';
  }
  document.addEventListener("click", function (e) {
    var rm = e.target.closest("[data-remove]");
    var co = e.target.closest("[data-checkout]");
    var qbtn = e.target.closest("[data-rv-line-qty] button");
    if (rm) { e.preventDefault(); setQty(rm.getAttribute("data-remove"), 0); }
    else if (co) { e.preventDefault(); showToast('✅ This is a preview. On Shopify this opens real Stripe / Apple&nbsp;Pay checkout.'); }
    else if (qbtn) {
      var wrap = qbtn.closest("[data-rv-line-qty]");
      var id = wrap.getAttribute("data-rv-line-qty");
      var cur = read()[id]; if (!cur) return;
      setQty(id, cur.qty + (qbtn.getAttribute("data-dir") === "up" ? 1 : -1));
    }
  });

  /* live search on index, redirect elsewhere */
  function bindSearch() {
    $$("[data-search]").forEach(function (form) {
      var input = $("input", form);
      var onIndex = !!$("[data-grid]");
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!onIndex) { window.location.href = "/vaults/?q=" + encodeURIComponent(input.value); }
      });
      if (onIndex) input.addEventListener("input", function () { filterGrid(input.value); });
    });
    var q = new URLSearchParams(location.search).get("q");
    if (q) { $$("[data-search] input").forEach(function (i) { i.value = q; }); filterGrid(q); var g = $("[data-grid]"); if (g) g.scrollIntoView({ behavior: "smooth" }); }
  }
  function filterGrid(q) {
    q = (q || "").toLowerCase().trim();
    $$("[data-grid] [data-title-card]").forEach(function (card) {
      var hay = card.getAttribute("data-title-card").toLowerCase();
      card.style.display = (!q || hay.indexOf(q) > -1) ? "" : "none";
    });
  }

  updateCount();
  renderCart();
  bindSearch();
})();
