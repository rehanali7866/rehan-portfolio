/* RAVOLUTION VAULTS — theme.js (vanilla, progressive enhancement) */
(function () {
  "use strict";
  var RV = window.RV || {};
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- money ---------- */
  function formatMoney(cents) {
    var fmt = RV.moneyFormat || "${{amount}}";
    var value = (cents / 100).toFixed(2);
    var parts = value.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    var withDecimals = parts.join(".");
    var noDecimals = parts[0];
    return fmt
      .replace(/\{\{\s*amount\s*\}\}/g, withDecimals)
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, noDecimals)
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, withDecimals);
  }

  /* ---------- toast ---------- */
  var toastEl = $("[data-rv-toast]");
  var toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.innerHTML = msg;
    toastEl.classList.add("is-open");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-open"); }, 3200);
  }

  /* ---------- cart count ---------- */
  function setCartCount(n) {
    $$("[data-rv-cart-count]").forEach(function (el) {
      el.textContent = n;
      el.setAttribute("data-count", n);
    });
  }
  function refreshCart() {
    return fetch(RV.routes.cart + ".js", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (c) { setCartCount(c.item_count); return c; })
      .catch(function () {});
  }

  /* ---------- mobile drawer ---------- */
  var drawer = $("[data-rv-drawer]");
  var scrim = $("[data-rv-scrim]");
  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add("is-open");
    if (scrim) { scrim.hidden = false; requestAnimationFrame(function () { scrim.classList.add("is-open"); }); }
    document.body.style.overflow = "hidden";
  }
  function closeDrawer() {
    if (drawer) drawer.classList.remove("is-open");
    if (scrim) { scrim.classList.remove("is-open"); setTimeout(function () { scrim.hidden = true; }, 300); }
    document.body.style.overflow = "";
  }
  $$("[data-rv-open-drawer]").forEach(function (b) { b.addEventListener("click", openDrawer); });
  $$("[data-rv-close-drawer]").forEach(function (b) { b.addEventListener("click", closeDrawer); });
  if (scrim) scrim.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

  /* ---------- AJAX add to cart ---------- */
  $$("form[action$='/cart/add'], form[data-rv-add]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (!window.fetch) return; // let it POST normally on ancient browsers
      e.preventDefault();
      var btn = form.querySelector("[type=submit]");
      var label = btn ? btn.innerHTML : "";
      if (btn) { btn.disabled = true; btn.innerHTML = "Arming…"; }
      fetch(RV.routes.cartAdd + ".js", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form)
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.description || "Could not add");
          return refreshCart().then(function () {
            toast("⚔ <b>" + (res.d.product_title || "Item") + "</b> added to your vault");
          });
        })
        .catch(function (err) { toast("⚠ " + err.message); })
        .finally(function () { if (btn) { btn.disabled = false; btn.innerHTML = label; } });
    });
  });

  /* ---------- rail (top sellers) controls ---------- */
  $$("[data-rv-rail]").forEach(function (wrap) {
    var rail = $(".rv-rail", wrap) || wrap;
    var prev = $("[data-rv-rail-prev]", wrap);
    var next = $("[data-rv-rail-next]", wrap);
    function step(dir) {
      var card = rail.querySelector(":scope > *");
      var amt = card ? card.getBoundingClientRect().width + 20 : 320;
      rail.scrollBy({ left: dir * amt, behavior: "smooth" });
    }
    if (prev) prev.addEventListener("click", function () { step(-1); });
    if (next) next.addEventListener("click", function () { step(1); });
  });

  /* ---------- cart page line qty / remove ---------- */
  function changeLine(line, qty) {
    fetch(RV.routes.cartChange + ".js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: line, quantity: qty })
    })
      .then(function (r) { return r.json(); })
      .then(function () { window.location.reload(); });
  }
  $$("[data-rv-line-remove]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      changeLine(a.getAttribute("data-rv-line-remove"), 0);
    });
  });
  $$("[data-rv-line-qty]").forEach(function (wrap) {
    var key = wrap.getAttribute("data-rv-line-qty");
    var input = $("input", wrap);
    $$("button", wrap).forEach(function (b) {
      b.addEventListener("click", function () {
        var delta = b.getAttribute("data-dir") === "up" ? 1 : -1;
        var q = Math.max(0, parseInt(input.value, 10) + delta);
        changeLine(key, q);
      });
    });
  });

  /* ---------- product page qty stepper ---------- */
  $$("[data-rv-qty]").forEach(function (wrap) {
    var input = $("input", wrap);
    $$("button", wrap).forEach(function (b) {
      b.addEventListener("click", function () {
        var delta = b.getAttribute("data-dir") === "up" ? 1 : -1;
        input.value = Math.max(1, parseInt(input.value, 10) + delta);
      });
    });
  });

  /* ---------- reveal on scroll ---------- */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("rv-reveal"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    $$("[data-rv-reveal]").forEach(function (el) { io.observe(el); });
  }

  /* keep count in sync on load */
  if (typeof RV.cartCount === "number") setCartCount(RV.cartCount);
})();
