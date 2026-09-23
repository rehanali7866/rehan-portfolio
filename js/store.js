/* =====================================================================
   ravolution.agency — store.js (v1)
   Vanilla ES2017, no dependencies, defer-safe. Every block tolerates the
   absence of its elements — this file loads on every /vaults/ page, most
   of which only use a fraction of it. Relies on window.rvTrack / rvToast
   from site.js (loaded first) and on the shared form handler in site.js
   for every <form data-form> (waitlist, resend, etc.) — this file only
   wires up cart/catalogue-specific behaviour.

   Data source: a <script type="application/json" id="rvCatalogue"> that
   every store page embeds (the whole of data/products.json), plus, on
   product pages, a small <script id="rvProduct"> for the current item.

   Cart storage: localStorage.rv_cart — an array of {id, kind, qty}.
   ===================================================================== */
(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function closest(el, sel) {
    while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentElement; }
    return null;
  }
  function track(name, data) { if (typeof window.rvTrack === 'function') window.rvTrack(name, data); }
  function toast(msg) { if (typeof window.rvToast === 'function') window.rvToast(msg); }

  /* ---------------------------------------------------------------- money */
  function money(pence) {
    pence = Math.round(pence || 0);
    var neg = pence < 0; pence = Math.abs(pence);
    var pounds = Math.floor(pence / 100), rem = pence % 100;
    var out = '£' + pounds.toLocaleString('en-GB') + (rem ? '.' + (rem < 10 ? '0' + rem : rem) : '');
    return neg ? '−' + out : out;
  }

  /* ---------------------------------------------------------------- catalogue data */
  var CATALOGUE = null;
  function getCatalogue() {
    if (CATALOGUE) return CATALOGUE;
    var el = document.getElementById('rvCatalogue');
    if (!el) return null;
    try { CATALOGUE = JSON.parse(el.textContent); } catch (e) { CATALOGUE = null; }
    return CATALOGUE;
  }
  function categoryName(cats, slug) {
    var c = (cats || []).filter(function (x) { return x.slug === slug; })[0];
    return c ? c.name : null;
  }
  function categoryAccent(cats, slug) {
    var c = (cats || []).filter(function (x) { return x.slug === slug; })[0];
    return c ? c.accent : '#3a342e';
  }
  /* Look up a product or bundle by slug across the catalogue, with a
     normalised shape usable by the cart/upsell code regardless of kind. */
  function findItem(id) {
    var data = getCatalogue();
    if (!data) return null;
    var p = (data.products || []).filter(function (x) { return x.slug === id; })[0];
    if (p) return { kind: 'product', slug: p.slug, title: p.title, price_pence: p.price_pence, category: p.category, status: p.status, checkout: p.checkout, cover_image: p.cover_image || null };
    var b = (data.bundles || []).filter(function (x) { return x.slug === id; })[0];
    if (b) return { kind: 'bundle', slug: b.slug, title: b.title, price_pence: b.price_pence, category: null, status: 'live', checkout: b.checkout, includes: b.includes };
    return null;
  }

  /* ---------------------------------------------------------------- cart storage */
  var CART_KEY = 'rv_cart';
  function readCart() {
    try {
      var v = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function writeCart(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) { /* storage blocked */ }
  }
  function cartCount(items) {
    return (items || readCart()).reduce(function (n, l) { return n + (l.qty || 1); }, 0);
  }
  function addToCart(id, kind, qty) {
    var items = readCart();
    var line = items.filter(function (l) { return l.id === id; })[0];
    if (line) { line.qty = (line.qty || 1) + (qty || 1); }
    else { items.push({ id: id, kind: kind, qty: qty || 1 }); }
    writeCart(items);
    refreshCartUI();
    return items;
  }
  function removeFromCart(id) {
    var items = readCart().filter(function (l) { return l.id !== id; });
    writeCart(items);
    refreshCartUI();
    return items;
  }

  function updateCartBadges() {
    var n = cartCount();
    $$('[data-cart-count]').forEach(function (el) { el.textContent = String(n); });
  }

  /* ---------------------------------------------------------------- toolbar (search / chips / sort / availability) */
  function initToolbar() {
    var toolbar = $('[data-store-toolbar]');
    if (!toolbar) return;
    var grid = $('#storeGrid');
    if (!grid) return;
    var cards = $$('.vault-card', grid);
    var countEl = $('#storeCount');
    var emptyEl = $('#storeEmpty');
    var mode = toolbar.getAttribute('data-mode');
    var searchInput = $('[data-store-search]', toolbar);
    var chipsWrap = $('[data-store-chips]', toolbar);
    var chips = chipsWrap ? $$('[data-cat]', chipsWrap) : [];
    var sortSelect = $('[data-store-sort]', toolbar);
    var availSelect = $('[data-store-avail]', toolbar);

    var url = new URLSearchParams(location.search);
    var state = {
      cat: mode === 'catalogue' ? (url.get('cat') || 'all') : (toolbar.getAttribute('data-cat') || 'all'),
      q: url.get('q') || '',
      sort: url.get('sort') || 'featured',
      avail: url.get('avail') || 'all'
    };

    if (searchInput) searchInput.value = state.q;
    if (sortSelect) sortSelect.value = state.sort;
    if (availSelect) availSelect.value = state.avail;

    function markActiveChip() {
      chips.forEach(function (c) {
        var active = c.getAttribute('data-cat') === state.cat;
        c.classList.toggle('is-active', active);
        if (active) c.setAttribute('aria-current', 'page'); else c.removeAttribute('aria-current');
      });
    }
    markActiveChip();

    function updateUrl() {
      if (mode !== 'catalogue') return;
      var p = new URLSearchParams();
      if (state.cat && state.cat !== 'all') p.set('cat', state.cat);
      if (state.q) p.set('q', state.q);
      if (state.sort && state.sort !== 'featured') p.set('sort', state.sort);
      if (state.avail && state.avail !== 'all') p.set('avail', state.avail);
      var qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    }

    function sortList(list) {
      var copy = list.slice();
      if (state.sort === 'price-asc') copy.sort(function (a, b) { return (+a.dataset.price) - (+b.dataset.price); });
      else if (state.sort === 'price-desc') copy.sort(function (a, b) { return (+b.dataset.price) - (+a.dataset.price); });
      else if (state.sort === 'title-asc') copy.sort(function (a, b) { return a.dataset.title.localeCompare(b.dataset.title); });
      else {
        copy = copy.map(function (el, i) { return { el: el, i: i }; })
          .sort(function (a, b) {
            var fa = a.el.dataset.featured === 'true', fb = b.el.dataset.featured === 'true';
            if (fa === fb) return a.i - b.i;
            return fa ? -1 : 1;
          })
          .map(function (x) { return x.el; });
      }
      return copy;
    }

    function render() {
      var q = state.q.trim().toLowerCase();
      var visible = [];
      cards.forEach(function (card) {
        var matchesCat = state.cat === 'all' || card.dataset.cat === state.cat;
        var matchesAvail = state.avail === 'all'
          || (state.avail === 'available' && card.dataset.status === 'live')
          || (state.avail === 'soon' && card.dataset.status === 'coming_soon');
        var hay = (card.dataset.title || '') + ' ' + (card.dataset.tagline || '');
        var matchesQ = !q || hay.indexOf(q) !== -1;
        var show = matchesCat && matchesAvail && matchesQ;
        card.hidden = !show;
        if (show) visible.push(card);
      });
      sortList(visible).forEach(function (card) { grid.appendChild(card); });
      if (countEl) countEl.textContent = 'Showing ' + visible.length + ' of ' + cards.length;
      if (emptyEl) emptyEl.hidden = visible.length !== 0;
      updateUrl();
    }

    if (mode === 'catalogue') {
      chips.forEach(function (chip) {
        chip.addEventListener('click', function (e) {
          e.preventDefault();
          state.cat = chip.getAttribute('data-cat') || 'all';
          markActiveChip();
          render();
        });
      });
    }
    if (searchInput) searchInput.addEventListener('input', function () { state.q = searchInput.value; render(); });
    if (sortSelect) sortSelect.addEventListener('change', function () { state.sort = sortSelect.value; render(); });
    if (availSelect) availSelect.addEventListener('change', function () { state.avail = availSelect.value; render(); });

    document.addEventListener('click', function (e) {
      if (!closest(e.target, '[data-store-reset]')) return;
      state.q = ''; state.avail = 'all'; state.sort = 'featured';
      if (mode === 'catalogue') state.cat = 'all';
      if (searchInput) searchInput.value = '';
      if (sortSelect) sortSelect.value = 'featured';
      if (availSelect) availSelect.value = 'all';
      markActiveChip();
      render();
    });

    render();
  }

  /* ---------------------------------------------------------------- add / buy buttons (cards + buy box) */
  function refreshCartUI() {
    updateCartBadges();
    renderCartPage();
  }

  function initStoreActions() {
    document.addEventListener('click', function (e) {
      var add = closest(e.target, '[data-store-add]');
      if (add) {
        var id = add.getAttribute('data-id'), kind = add.getAttribute('data-kind') || 'product';
        addToCart(id, kind, 1);
        track('add_to_cart', { id: id, kind: kind });
        toast('Added to basket');
        return;
      }
      var buy = closest(e.target, '[data-store-buy]');
      if (buy) {
        var bid = buy.getAttribute('data-id'), bkind = buy.getAttribute('data-kind') || 'product';
        if (buy.tagName === 'A' && buy.getAttribute('href')) {
          track('begin_checkout', { id: bid, kind: bkind, mode: 'direct' });
          return; // let the anchor navigate to the payment link
        }
        e.preventDefault();
        addToCart(bid, bkind, 1);
        track('begin_checkout', { id: bid, kind: bkind, mode: 'cart' });
        location.href = '/vaults/cart.html';
      }
    });
  }

  /* ---------------------------------------------------------------- product page: view_product */
  function initProductView() {
    var el = document.getElementById('rvProduct');
    if (!el) return;
    try {
      var p = JSON.parse(el.textContent);
      track('view_product', { id: p.slug, kind: p.kind, price: p.price_pence, category: p.category });
    } catch (e) { /* noop */ }
  }

  /* ---------------------------------------------------------------- vault door dial */
  function initDoorDial() {
    var dial = document.getElementById('viDial');
    if (!dial) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    function pad(n) { return String(n).padStart(2, '0'); }
    setInterval(function () {
      if (dial.getAttribute('data-scrub') === '1') return; // site.js drives the dial while the door is being scrolled open
      dial.textContent = pad(Math.floor(Math.random() * 60)) + '-' + pad(Math.floor(Math.random() * 60)) + '-' + pad(Math.floor(Math.random() * 60));
    }, 900);
  }

  /* ---------------------------------------------------------------- coupons */
  function findCoupon(code) {
    var data = getCatalogue();
    if (!data || !code) return null;
    code = code.trim().toUpperCase();
    return (data.coupons || []).filter(function (c) { return c.code.toUpperCase() === code; })[0] || null;
  }
  function couponDiscount(coupon, subtotal) {
    if (!coupon) return 0;
    if (coupon.type === 'percent') return Math.round(subtotal * (coupon.value / 100));
    if (coupon.type === 'fixed') return Math.min(subtotal, Math.round(coupon.value));
    return 0;
  }

  var COUPON_KEY = 'rv_coupon';
  function readAppliedCoupon() {
    try { return localStorage.getItem(COUPON_KEY) || ''; } catch (e) { return ''; }
  }
  function writeAppliedCoupon(code) {
    try {
      if (code) localStorage.setItem(COUPON_KEY, code); else localStorage.removeItem(COUPON_KEY);
    } catch (e) { /* noop */ }
  }

  /* ---------------------------------------------------------------- cart page */
  function lineThumb(item, cats) {
    var span = document.createElement('span');
    span.className = 'line-thumb';
    span.setAttribute('aria-hidden', 'true');
    var accent = item.category ? categoryAccent(cats, item.category) : '#3a342e';
    span.style.setProperty('--accent', accent);
    if (item.cover_image) {
      var img = document.createElement('img');
      img.src = item.cover_image; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      span.classList.add('line-thumb--img');
      span.appendChild(img);
    } else {
      span.textContent = (item.title || '?').charAt(0);
    }
    return span;
  }

  function renderCartPage() {
    var root = $('#cart');
    if (!root) return;
    var data = getCatalogue();
    if (!data) return;
    var cats = data.categories || [];
    var provider = root.getAttribute('data-provider') || 'none';

    var items = readCart();
    var lines = items.map(function (l) {
      var item = findItem(l.id);
      return item ? { id: l.id, qty: l.qty || 1, item: item } : null;
    }).filter(Boolean);

    var linesEl = $('#cartLines');
    var emptyEl = $('#cartEmpty');
    var upsellEl = $('#cartUpsell');
    var upsellBody = $('#cartUpsellBody');
    var checkoutArea = $('#checkoutArea');
    var waitlist = $('#cartWaitlist');
    var basketField = $('#cartBasketField');

    if (emptyEl) emptyEl.hidden = lines.length !== 0;
    if (linesEl) {
      linesEl.hidden = lines.length === 0;
      linesEl.innerHTML = '';
      lines.forEach(function (line) {
        var li = document.createElement('li');
        li.className = 'cart-line';
        li.appendChild(lineThumb(line.item, cats));
        var body = document.createElement('div');
        body.className = 'cart-line-body';
        var title = document.createElement('p');
        title.className = 'cart-line-title';
        var a = document.createElement('a');
        a.href = '/vaults/product/' + line.item.slug + '.html';
        a.textContent = line.item.title;
        title.appendChild(a);
        body.appendChild(title);
        var catP = document.createElement('p');
        catP.className = 'cart-line-cat';
        catP.textContent = line.item.kind === 'bundle' ? 'Bundle' : (categoryName(cats, line.item.category) || '');
        body.appendChild(catP);
        if (line.qty > 1) {
          var qtyP = document.createElement('p');
          qtyP.className = 'cart-line-qty';
          qtyP.textContent = 'Qty ' + line.qty;
          body.appendChild(qtyP);
        }
        if (provider === 'links' && lines.length > 1 && line.item.checkout && line.item.checkout.url) {
          var cbtn = document.createElement('a');
          cbtn.className = 'btn-secondary btn-sm cart-line-checkout';
          cbtn.href = line.item.checkout.url;
          cbtn.textContent = 'Checkout this item';
          cbtn.setAttribute('data-store-buy', '');
          cbtn.setAttribute('data-id', line.item.slug);
          cbtn.setAttribute('data-kind', line.item.kind);
          body.appendChild(cbtn);
        }
        li.appendChild(body);
        var end = document.createElement('div');
        end.className = 'cart-line-end';
        var price = document.createElement('p');
        price.className = 'cart-line-price';
        price.textContent = money(line.item.price_pence * line.qty);
        end.appendChild(price);
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'cart-line-remove';
        rm.textContent = 'Remove';
        rm.addEventListener('click', function () {
          removeFromCart(line.id);
          track('remove_from_cart', { id: line.id });
          toast('Removed from basket');
        });
        end.appendChild(rm);
        li.appendChild(end);
        linesEl.appendChild(li);
      });
    }

    var subtotal = lines.reduce(function (sum, l) { return sum + l.item.price_pence * l.qty; }, 0);

    /* upsell: a bundle overlapping the basket, else 1 related product */
    if (upsellEl && upsellBody) {
      upsellBody.innerHTML = '';
      var inCartIds = lines.map(function (l) { return l.id; });
      var best = null, bestOverlap = 0;
      (data.bundles || []).forEach(function (b) {
        var overlap = (b.includes || []).filter(function (s) { return inCartIds.indexOf(s) !== -1; }).length;
        var alreadyOwned = (b.includes || []).every(function (s) { return inCartIds.indexOf(s) !== -1; });
        if (overlap > 0 && !alreadyOwned && overlap > bestOverlap) { best = b; bestOverlap = overlap; }
      });
      if (best) {
        var card = document.createElement('div');
        card.className = 'upsell-card';
        card.appendChild(lineThumb({ title: best.title, cover_image: best.cover_image }, cats));
        var info = document.createElement('div');
        info.className = 'upsell-info';
        var b2 = document.createElement('b'); b2.textContent = best.title; info.appendChild(b2);
        var s2 = document.createElement('span');
        s2.textContent = best.blurb + ' ' + money(best.price_pence) + ' (save ' + money(best.saving_pence) + ')';
        info.appendChild(s2);
        card.appendChild(info);
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn-secondary btn-sm';
        addBtn.textContent = 'Add bundle';
        addBtn.setAttribute('data-store-add', '');
        addBtn.setAttribute('data-id', best.slug);
        addBtn.setAttribute('data-kind', 'bundle');
        card.appendChild(addBtn);
        upsellBody.appendChild(card);
        upsellEl.hidden = false;
      } else if (lines.length) {
        var lastCat = lines[lines.length - 1].item.category;
        var candidate = (data.products || []).filter(function (p) {
          return p.status === 'live' && p.category === lastCat && inCartIds.indexOf(p.slug) === -1;
        })[0];
        if (candidate) {
          var card2 = document.createElement('div');
          card2.className = 'upsell-card';
          card2.appendChild(lineThumb({ title: candidate.title, category: candidate.category, cover_image: candidate.cover_image }, cats));
          var info2 = document.createElement('div');
          info2.className = 'upsell-info';
          var b3 = document.createElement('b'); b3.textContent = candidate.title; info2.appendChild(b3);
          var s3 = document.createElement('span'); s3.textContent = candidate.tagline + ' ' + money(candidate.price_pence); info2.appendChild(s3);
          card2.appendChild(info2);
          var addBtn2 = document.createElement('button');
          addBtn2.type = 'button'; addBtn2.className = 'btn-secondary btn-sm'; addBtn2.textContent = '+ Add to cart';
          addBtn2.setAttribute('data-store-add', ''); addBtn2.setAttribute('data-id', candidate.slug); addBtn2.setAttribute('data-kind', 'product');
          card2.appendChild(addBtn2);
          upsellBody.appendChild(card2);
          upsellEl.hidden = false;
        } else {
          upsellEl.hidden = true;
        }
      } else {
        upsellEl.hidden = true;
      }
    }

    /* coupon */
    var couponCode = readAppliedCoupon();
    var coupon = couponCode ? findCoupon(couponCode) : null;
    if (coupon && (!coupon.active || subtotal < (coupon.min_pence || 0))) { coupon = null; couponCode = ''; writeAppliedCoupon(''); }
    var discount = coupon ? couponDiscount(coupon, subtotal) : 0;
    var total = Math.max(0, subtotal - discount);

    var sumSubtotal = $('#sumSubtotal'), sumDiscountRow = $('#sumDiscountRow'), sumDiscount = $('#sumDiscount'),
      sumCode = $('#sumCode'), sumTotal = $('#sumTotal'), appliedNote = $('#couponAppliedNote');
    if (sumSubtotal) sumSubtotal.textContent = money(subtotal);
    if (sumDiscountRow) sumDiscountRow.hidden = !coupon;
    if (coupon) {
      if (sumDiscount) sumDiscount.textContent = '−' + money(discount);
      if (sumCode) sumCode.textContent = coupon.code;
    }
    if (sumTotal) sumTotal.textContent = money(total);
    if (appliedNote) appliedNote.hidden = !coupon;

    /* checkout adapter */
    if (checkoutArea) {
      checkoutArea.innerHTML = '';
      if (lines.length === 0) {
        // nothing to check out
      } else if (provider === 'links') {
        if (lines.length === 1) {
          var only = lines[0].item;
          if (only.checkout && only.checkout.url) {
            var link = document.createElement('a');
            link.className = 'btn-primary';
            link.href = only.checkout.url;
            link.textContent = 'Checkout — ' + only.title;
            link.setAttribute('data-store-buy', '');
            link.setAttribute('data-id', only.slug);
            link.setAttribute('data-kind', only.kind);
            checkoutArea.appendChild(link);
          } else {
            var note = document.createElement('p');
            note.className = 'checkout-note';
            note.textContent = 'Checkout link is not set for this item yet — email us and we will sort it by hand.';
            checkoutArea.appendChild(note);
          }
        } else {
          var multiNote = document.createElement('p');
          multiNote.className = 'checkout-multi-note';
          multiNote.textContent = 'Our payment provider checks out one item at a time — use "Checkout this item" on each line above.';
          checkoutArea.appendChild(multiNote);
        }
      } else {
        var pnote = document.createElement('p');
        pnote.className = 'checkout-note';
        pnote.textContent = 'Checkout opens with the Vaults.';
        checkoutArea.appendChild(pnote);
      }
    }
    if (waitlist) waitlist.hidden = !(provider === 'none' && lines.length > 0);
    if (basketField) {
      basketField.value = lines.map(function (l) { return l.item.title + (l.qty > 1 ? ' (x' + l.qty + ')' : ''); }).join(', ');
    }
  }

  function initCoupon() {
    var form = $('#couponForm');
    if (!form) return;
    /* Stripe Payment Links don't know about site-side codes, so only show the box when a code is live */
    var cat = getCatalogue();
    if (!((cat && cat.coupons) || []).some(function (c) { return c.active; })) { form.hidden = true; writeAppliedCoupon(''); return; }
    var input = $('#couponCode', form);
    var note = $('#couponNote', form);
    var existing = readAppliedCoupon();
    if (existing && input) input.value = existing;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = (input && input.value || '').trim();
      if (!code) return;
      var coupon = findCoupon(code);
      var data = getCatalogue();
      var subtotal = readCart().reduce(function (sum, l) {
        var item = findItem(l.id);
        return sum + (item ? item.price_pence * (l.qty || 1) : 0);
      }, 0);
      if (!coupon) {
        if (note) { note.textContent = "THAT CODE DOESN'T EXIST"; note.setAttribute('data-state', 'err'); }
        return;
      }
      if (!coupon.active) {
        if (note) { note.textContent = 'THAT CODE IS NOT ACTIVE YET'; note.setAttribute('data-state', 'err'); }
        return;
      }
      if (subtotal < (coupon.min_pence || 0)) {
        if (note) { note.textContent = 'NEEDS A BASKET OF AT LEAST ' + money(coupon.min_pence) + ' OR MORE'; note.setAttribute('data-state', 'err'); }
        return;
      }
      writeAppliedCoupon(coupon.code);
      if (note) { note.textContent = (coupon.label || (coupon.value + '% off')).toUpperCase() + ' APPLIED'; note.setAttribute('data-state', 'ok'); }
      track('coupon_applied', { code: coupon.code });
      renderCartPage();
    });
  }

  /* ---------------------------------------------------------------- thanks page */
  function initThanks() {
    if ($('.thanks-page')) track('purchase', {});
  }

  /* ---------------------------------------------------------------- boot */
  function init() {
    updateCartBadges();
    initToolbar();
    initStoreActions();
    initProductView();
    initDoorDial();
    initCoupon();
    renderCartPage();
    initThanks();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
