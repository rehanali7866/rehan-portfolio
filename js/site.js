/* =====================================================================
   ravolution.agency — site.js (v2 — motion layer)
   Vanilla ES2017, no dependencies, defer-safe. Every block tolerates the
   absence of its elements (no console errors on pages without them).

   Public API
     window.rvTrack(name, data)   analytics event (Vercel va + gtag if present)
     window.rvToast(msg)          bottom toast, 3.2s (#toast)
     window.rvConsent()           "all" | "essential" | null
     window.RV_OPTIONAL_SCRIPTS   [] of script srcs loaded only on consent "all"

   Markup hooks
     #nav .scrolled / .on-dark      [data-nav-dark] sections switch the dark nav
     #burger + #siteMenu            accessible menu dialog
     .reveal                        one-time fade-up
     #consent [data-consent=all|essential], [data-consent-open]
     [data-track="name"] [data-track-props='{"k":"v"}']
     form[data-form] data-subject data-success data-event  (+ [role=status])
     .sticky-cta[data-hide-when="#selector"]
     [data-copy] / [data-copy="text"]
   ===================================================================== */
(function () {
  'use strict';

  var CONTACT_EMAIL = 'rehan@ravolution.agency';
  var FORM_ENDPOINT = 'https://formsubmit.co/ajax/2c5ecb72f1ee0224596c06758178d5aa';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FINE = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  function emit(name) {
    var ev;
    try { ev = new CustomEvent(name); } catch (e) { ev = document.createEvent('Event'); ev.initEvent(name, true, true); }
    document.dispatchEvent(ev);
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function closest(el, sel) {
    while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentElement; }
    return null;
  }

  /* shared refresh hook so consent/menu can re-evaluate the sticky CTA */
  var stickyRefresh = function () {};

  /* ---------------------------------------------------------------- analytics */
  window.rvTrack = function (name, data) {
    if (!name) return;
    var payload = data || {};
    try { if (typeof window.va === 'function') window.va('event', { name: name, data: payload }); } catch (e) { /* noop */ }
    try { if (typeof window.gtag === 'function') window.gtag('event', name, payload); } catch (e) { /* noop */ }
  };

  /* ---------------------------------------------------------------- toast */
  var toastTimer = null;
  window.rvToast = function (msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  };

  /* ---------------------------------------------------------------- consent */
  window.RV_OPTIONAL_SCRIPTS = window.RV_OPTIONAL_SCRIPTS || [];
  function consentGet() { try { return localStorage.getItem('rv_consent'); } catch (e) { return null; } }
  function consentSet(v) { try { localStorage.setItem('rv_consent', v); } catch (e) { /* storage blocked */ } }
  window.rvConsent = consentGet;

  function loadOptionalScripts() {
    if (consentGet() !== 'all') return;
    (window.RV_OPTIONAL_SCRIPTS || []).forEach(function (item) {
      var src = typeof item === 'string' ? item : (item && item.src);
      if (!src || document.querySelector('script[src="' + src + '"]')) return;
      var s = document.createElement('script');
      s.src = src; s.defer = true;
      if (item && item.async) s.async = true;
      document.head.appendChild(s);
    });
  }

  function initConsent() {
    var banner = $('#consent');
    function show() {
      if (!banner) return;
      banner.hidden = false;
      stickyRefresh();
    }
    function hide() {
      if (!banner) return;
      banner.hidden = true;
      stickyRefresh();
    }
    if (banner) {
      $$('[data-consent]', banner).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var choice = btn.getAttribute('data-consent') === 'all' ? 'all' : 'essential';
          consentSet(choice);
          hide();
          window.rvTrack('consent_choice', { choice: choice });
          if (choice === 'all') loadOptionalScripts();
        });
      });
      banner.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !banner.hidden) { consentSet('essential'); hide(); }
      });
    }
    document.addEventListener('click', function (e) {
      var opener = closest(e.target, '[data-consent-open]');
      if (!opener || !banner) return;
      e.preventDefault();
      show();
      var first = $('[data-consent]', banner);
      if (first) first.focus();
    });
    if (!consentGet()) { show(); } else { loadOptionalScripts(); }
  }

  /* ---------------------------------------------------------------- nav + scroll progress + back to top */
  function initNav() {
    var nav = $('#nav');
    var progress = $('#scrollProgress');
    var toTop = $('#toTop');
    var darkEls = $$('[data-nav-dark]');
    var ticking = false, lastY = window.scrollY || window.pageYOffset || 0, hidden = false;
    function check() {
      ticking = false;
      var y = window.scrollY || window.pageYOffset || 0;
      if (nav) {
        nav.classList.toggle('scrolled', y > 40);
        if (darkEls.length) {
          var mid = (nav.offsetHeight || 64) / 2;
          var dark = darkEls.some(function (el) {
            var r = el.getBoundingClientRect();
            return r.top <= mid && r.bottom > mid;
          });
          nav.classList.toggle('on-dark', dark);
        }
        if (!REDUCED) {
          var menuOpen = document.body.classList.contains('menu-open');
          if (menuOpen || y < 160) hidden = false;
          else if (y > lastY + 6) hidden = true;
          else if (y < lastY - 6) hidden = false;
          nav.classList.toggle('nav-hidden', hidden);
        }
      }
      var doc = document.documentElement;
      var max = Math.max(1, (doc.scrollHeight || 0) - (window.innerHeight || 0));
      var p = Math.min(1, Math.max(0, y / max)).toFixed(4);
      if (progress) { progress.style.setProperty('--p', p); progress.classList.toggle('show', y > 80); }
      if (toTop) { toTop.style.setProperty('--p', p); toTop.classList.toggle('show', y > 600); }
      lastY = y;
    }
    function onScroll() {
      if (!ticking) { ticking = true; window.requestAnimationFrame(check); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    if (toTop) toTop.addEventListener('click', function () {
      window.rvTrack('cta_click', { label: 'Back to top', href: '#top' });
      try { window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
    });
    check();
  }

  /* ---------------------------------------------------------------- menu */
  function initMenu() {
    var burger = $('#burger');
    var menu = $('#siteMenu');
    if (!burger || !menu) return;
    var closeTimer = null;

    function isOpen() { return !menu.hidden; }
    function visible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }
    function focusables() {
      return $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', menu).filter(visible);
    }
    function open() {
      clearTimeout(closeTimer);
      menu.hidden = false;
      burger.classList.add('open');
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', 'Close menu');
      document.body.classList.add('menu-open');
      window.requestAnimationFrame(function () { menu.classList.add('open'); });
      var f = focusables();
      (f[0] || menu).focus({ preventScroll: true });
      window.rvTrack('menu_open', { page: location.pathname });
      stickyRefresh();
    }
    function close(returnFocus) {
      menu.classList.remove('open');
      burger.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('menu-open');
      clearTimeout(closeTimer);
      closeTimer = setTimeout(function () { menu.hidden = true; }, REDUCED ? 0 : 400);
      if (returnFocus !== false) burger.focus();
      stickyRefresh();
    }
    burger.addEventListener('click', function () { if (isOpen()) { close(); } else { open(); } });
    menu.addEventListener('click', function (e) {
      if (closest(e.target, 'a[href]')) close(false);
    });
    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        var ring = [burger].concat(focusables());
        if (!ring.length) return;
        var first = ring[0], last = ring[ring.length - 1];
        var active = document.activeElement;
        var inside = ring.indexOf(active) !== -1;
        if (e.shiftKey && (active === first || !inside)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (active === last || !inside)) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------------------------------------------------------------- entrance system */
  var REVEAL_GROUPS = ['.stats-grid', '.trust-strip', '.work-grid', '.shelf-grid', '.store-grid', '.post-grid', '.nm-steps', '.related-grid', '.footer-top', '.account-steps', '.faq', '.cart-lines', '.nf-links', '.legal-toc', '.share-row', '.pdp-detail-grid', '.nm-demo-grid', '.nm-start-grid', '.contact-layout', '.account-grid', '.thanks-grid'];
  var REVEAL_SINGLES = ['.section-head', '.form-card', '.nm-price-card', '.cta-box', '.company-card', '.callout', '.post-header', '.author-box', '.pdp-top', '.cart-side', '.ins-hero', '.buy-box', '.legal-head', '.nf-inner', '.cart-head', '.ins-dispatch', '.pdp-faq', '.nm-form', '.toolbar', '.crumbs', '.nm-pill', '.nm-sub', '.nm-ctas', '.nm-hero-note', '.nm-final .section-head', '.legal-prose > h2', '.legal-prose > p', '.legal-prose > ul', '.legal-prose > ol', '.prose > h2', '.prose > blockquote', '.post-lead', '.post-meta', '.thanks-ctas', '.account-portal', '.resend-form', '.cat-meta', '.pdp-related .section-head'];
  var SPLIT_SEL = '.section-head h2, h1.legal-title, .nm-hero h1, .ins-hero h1, .post-header h1, .pdp-top h1, .cart-head h1, .account-page h1, .nf-inner h1';

  function tagReveal(el, i) {
    if (!el || el.nodeType !== 1 || el.classList.contains('reveal') || el.classList.contains('revealed')) return;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEMPLATE') return;
    el.classList.add('reveal');
    if (i) el.style.transitionDelay = Math.min(i * 70, 420) + 'ms';
  }
  function autoTag() {
    REVEAL_GROUPS.forEach(function (sel) {
      $$(sel).forEach(function (grp) {
        var kids = Array.prototype.slice.call(grp.children);
        if (!kids.length) return;
        if (grp.classList.contains('reveal')) { grp.classList.remove('reveal'); grp.style.transitionDelay = ''; }
        kids.forEach(function (k, i) { tagReveal(k, i); });
      });
    });
    REVEAL_SINGLES.forEach(function (sel) {
      var list = [];
      try { list = $$(sel); } catch (e) { list = []; }
      list.forEach(function (el) {
        if (closest(el.parentElement, '.reveal')) return;
        tagReveal(el, 0);
      });
    });
  }

  function splitWords(el) {
    if (REDUCED || el.classList.contains('split') || el.querySelector('img, a, svg, input')) return;
    if ((el.textContent || '').trim().length > 140) return;
    var idx = 0;
    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var parts = n.nodeValue.split(/(\s+)/);
          var frag = document.createDocumentFragment();
          parts.forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span'); w.className = 'w';
            var wi = document.createElement('span'); wi.className = 'wi'; wi.textContent = p;
            wi.style.transitionDelay = Math.min(idx * 45, 600) + 'ms'; idx++;
            w.appendChild(wi); frag.appendChild(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') { walk(n); }
      });
    }
    walk(el);
    el.classList.add('split');
  }

  function animateCount(el) {
    if (el.children.length) return;
    var txt = (el.textContent || '').trim();
    var m = /^([^\d]*)(\d[\d,]*)(.*)$/.exec(txt);
    if (!m) return;
    var target = parseInt(m[2].replace(/,/g, ''), 10);
    if (isNaN(target)) return;
    var pre = m[1], suf = m[3], start = null, dur = 1300;
    el.style.fontVariantNumeric = 'tabular-nums';
    el.textContent = pre + '0' + suf;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + Math.round(target * e) + suf;
      if (p < 1) window.requestAnimationFrame(step); else el.textContent = txt;
    }
    window.requestAnimationFrame(step);
  }
  function onRevealed(el) {
    var c = el.querySelector('.count') || (el.classList.contains('stat') ? el.querySelector('.stat-num') : null);
    if (c && !c.__counted) { c.__counted = true; if (!REDUCED) animateCount(c); }
  }

  function initReveal() {
    autoTag();
    $$(SPLIT_SEL).forEach(splitWords);
    var els = $$('.reveal, .split');
    if (!els.length) return;
    function show(el) {
      if (el.classList.contains('in')) return;
      el.classList.add('in');
      onRevealed(el);
      if (el.classList.contains('reveal')) {
        var delay = parseFloat(el.style.transitionDelay) || 0;
        window.setTimeout(function () {
          el.classList.remove('reveal', 'in');
          el.classList.add('revealed');
          el.style.transitionDelay = '';
        }, 1300 + delay);
      }
    }
    function start() {
      if (!('IntersectionObserver' in window)) { els.forEach(show); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
        });
      }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });
      els.forEach(function (el) { io.observe(el); });
      window.setTimeout(function () {
        var vh = window.innerHeight || 800;
        els.forEach(function (el) {
          if (el.classList.contains('in') || el.classList.contains('revealed')) return;
          var r = el.getBoundingClientRect();
          if (r.top < vh && r.bottom > 0 && (r.width || r.height)) show(el);
        });
      }, 1600);
    }
    if (document.documentElement.classList.contains('is-loading')) document.addEventListener('rv:loaded', start, { once: true });
    else start();
  }

  /* ---------------------------------------------------------------- preloader (first visit per session) */
  function initPreloader() {
    var pl = $('#preloader');
    var html = document.documentElement;
    if (!pl || !html.classList.contains('is-loading')) {
      if (pl && pl.parentNode) pl.parentNode.removeChild(pl);
      html.classList.remove('is-loading');
      return;
    }
    var t0 = Date.now(), minShow = 1150, done = false;
    function finish() {
      if (done) return;
      done = true;
      pl.classList.add('done');
      html.classList.remove('is-loading');
      try { sessionStorage.setItem('rv_seen', '1'); } catch (e) { /* storage blocked */ }
      emit('rv:loaded');
      window.setTimeout(function () { if (pl.parentNode) pl.parentNode.removeChild(pl); }, 950);
    }
    function ready() { window.setTimeout(finish, Math.max(0, minShow - (Date.now() - t0))); }
    if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready);
    window.setTimeout(finish, 2600);
  }

  /* ---------------------------------------------------------------- 3D tilt + glare */
  function initTilt() {
    if (REDUCED || !FINE) return;
    $$('.project-card, .vault-card, .post-card, .nm-price-card, .cta-box, .service-card, .pdp-cover .cover--big').forEach(function (el) {
      el.classList.add('tilt');
      var glare = document.createElement('span');
      glare.className = 'glare'; glare.setAttribute('aria-hidden', 'true');
      el.appendChild(glare);
      var rect = null, raf = null, rx = 0, ry = 0;
      var max = el.classList.contains('cover--big') ? 9 : 5;
      var lift = el.classList.contains('cover--big') ? 0 : -6;
      var keep = ' box-shadow .5s ease, border-color .5s ease, background .4s ease';
      function move(e) {
        if (!rect) rect = el.getBoundingClientRect();
        var x = (e.clientX - rect.left) / (rect.width || 1), y = (e.clientY - rect.top) / (rect.height || 1);
        ry = (x - 0.5) * 2 * max; rx = (0.5 - y) * 2 * max;
        el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        if (!raf) raf = window.requestAnimationFrame(function () {
          raf = null;
          el.style.transform = 'perspective(1000px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) translateY(' + lift + 'px)';
        });
      }
      el.addEventListener('pointerenter', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        rect = el.getBoundingClientRect();
        el.style.transition = 'transform .15s ease,' + keep;
        el.classList.add('is-tilting');
      });
      el.addEventListener('pointermove', function (e) { if (!e.pointerType || e.pointerType === 'mouse') move(e); });
      el.addEventListener('pointerleave', function () {
        rect = null;
        el.classList.remove('is-tilting');
        el.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1),' + keep;
        el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
        window.setTimeout(function () {
          if (!el.classList.contains('is-tilting')) { el.style.transform = ''; el.style.transition = ''; }
        }, 650);
      });
    });
  }

  /* ---------------------------------------------------------------- magnetic buttons */
  function initMagnetic() {
    if (REDUCED || !FINE) return;
    $$('.btn-primary, .btn-secondary, .nav-cta, .btn-form, .to-top').forEach(function (el) {
      var r = null;
      var keep = ' box-shadow .45s ease, background .35s ease, border-color .35s ease, color .35s ease';
      el.addEventListener('pointerenter', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        r = el.getBoundingClientRect();
        el.style.transition = 'transform .2s ease,' + keep;
      });
      el.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        if (!r) r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / (r.width || 1);
        var dy = (e.clientY - (r.top + r.height / 2)) / (r.height || 1);
        el.style.transform = 'translate(' + (dx * 10).toFixed(1) + 'px,' + (dy * 8 - 2).toFixed(1) + 'px)';
      });
      el.addEventListener('pointerleave', function () {
        r = null;
        el.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1),' + keep;
        el.style.transform = 'translate(0px,0px)';
        window.setTimeout(function () { el.style.transform = ''; el.style.transition = ''; }, 520);
      });
    });
  }

  /* ---------------------------------------------------------------- cursor follower: magnetic snap outline */
  function initCursor() {
    if (REDUCED || !FINE) return;
    var c = $('#cursor');
    if (!c) return;
    var ring = $('.cursor-ring', c), dot = $('.cursor-dot', c);
    if (!ring || !dot) return;
    var DEF = 34, PAD = 10, MAXR = 28;
    var tx = -100, ty = -100, rx = -100, ry = -100, shown = false, raf = null, down = false;
    var overEl = null, snapRect = null; // {x,y,w,h}
    function applyBox(w, h) {
      var r = Math.min(w, h, MAXR * 2) / 2;
      r = Math.min(r, MAXR);
      ring.style.width = w + 'px';
      ring.style.height = h + 'px';
      ring.style.borderRadius = r + 'px';
    }
    function frame() {
      var w = snapRect ? snapRect.w : DEF;
      var h = snapRect ? snapRect.h : DEF;
      var destX = snapRect ? snapRect.x : tx - w / 2;
      var destY = snapRect ? snapRect.y : ty - h / 2;
      var ease = snapRect ? 0.3 : 0.18;
      rx += (destX - rx) * ease; ry += (destY - ry) * ease;
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
      dot.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)';
      if (Math.abs(destX - rx) > 0.2 || Math.abs(destY - ry) > 0.2) raf = window.requestAnimationFrame(frame);
      else raf = null;
    }
    function kick() { if (!raf) raf = window.requestAnimationFrame(frame); }
    function setOver(el) {
      overEl = el;
      if (el) {
        var r = el.getBoundingClientRect();
        snapRect = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
        applyBox(snapRect.w, snapRect.h);
        c.classList.add('hover');
      } else {
        snapRect = null;
        applyBox(DEF, DEF);
        c.classList.remove('hover');
      }
      kick();
    }
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      if (!shown) { shown = true; rx = tx - DEF / 2; ry = ty - DEF / 2; c.classList.add('show'); }
      var t = e.target && e.target.nodeType === 1 ? closest(e.target, 'a, button, [role="button"], input, textarea, select, summary, label, .chip, .tilt') : null;
      if (t !== overEl) setOver(t);
      kick();
    }, { passive: true });
    document.addEventListener('pointerdown', function (e) { if (!e.pointerType || e.pointerType === 'mouse') { down = true; ring.style.opacity = 0.7; } }, { passive: true });
    document.addEventListener('pointerup', function () { down = false; ring.style.opacity = ''; }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { c.classList.remove('show'); shown = false; });
    document.documentElement.addEventListener('mouseenter', function () { if (tx > -50) { c.classList.add('show'); shown = true; } });
    window.addEventListener('scroll', function () {
      if (overEl) { var r = overEl.getBoundingClientRect(); snapRect.x = r.left - PAD; snapRect.y = r.top - PAD; kick(); }
    }, { passive: true });
  }

  /* ---------------------------------------------------------------- hero spotlight + vault door parallax */
  function initMouseScenes() {
    if (REDUCED || !FINE) return;
    var hero = $('.hero');
    if (hero) {
      var bg = $('.hero-bg', hero);
      hero.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        var r = hero.getBoundingClientRect();
        var x = (e.clientX - r.left) / (r.width || 1), y = (e.clientY - r.top) / (r.height || 1);
        hero.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        hero.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        hero.classList.add('has-mouse');
        if (bg) { bg.style.setProperty('--px', ((x - 0.5) * 26).toFixed(1) + 'px'); bg.style.setProperty('--py', ((y - 0.5) * 20).toFixed(1) + 'px'); }
      });
      hero.addEventListener('pointerleave', function () {
        hero.classList.remove('has-mouse');
        if (bg) { bg.style.setProperty('--px', '0px'); bg.style.setProperty('--py', '0px'); }
      });
    }
    var door = $('#vault-intro');
    if (door) {
      var wrap = $('.vi-door-wrap', door), head = $('.vi-head', door);
      door.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        var r = door.getBoundingClientRect();
        var x = (e.clientX - r.left) / (r.width || 1) - 0.5, y = (e.clientY - r.top) / (r.height || 1) - 0.5;
        if (wrap) { wrap.style.setProperty('--ry', (x * 9).toFixed(2) + 'deg'); wrap.style.setProperty('--rx', (-y * 9).toFixed(2) + 'deg'); }
        if (head) { head.style.setProperty('--px', (x * 18).toFixed(1) + 'px'); head.style.setProperty('--py', (y * 14).toFixed(1) + 'px'); }
      });
      door.addEventListener('pointerleave', function () {
        if (wrap) { wrap.style.setProperty('--ry', '0deg'); wrap.style.setProperty('--rx', '0deg'); }
        if (head) { head.style.setProperty('--px', '0px'); head.style.setProperty('--py', '0px'); }
      });
    }
  }

  /* ---------------------------------------------------------------- vault door: scroll-driven opening */
  function initVaultScroll() {
    var intro = $('#vault-intro');
    if (!intro || REDUCED) return;
    var wrap = $('.vi-door-wrap', intro), handle = $('.vi-handle-scroll', intro), stage = $('.vi-stage', intro);
    var status = $('.vi-status', intro), dial = $('#viDial', intro);
    var ticking = false, last = -1;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function update() {
      ticking = false;
      var total = intro.offsetHeight - (window.innerHeight || 1);
      if (total <= 0) return;
      var p = Math.min(1, Math.max(0, -intro.getBoundingClientRect().top / total));
      if (Math.abs(p - last) < 0.0005) return;
      last = p;
      if (handle) handle.style.setProperty('--hr', (p * 720).toFixed(1) + 'deg');
      if (wrap) {
        wrap.style.setProperty('--ds', (1 + p * 0.5).toFixed(3));
        wrap.style.setProperty('--do', (1 - Math.max(0, (p - 0.75) / 0.25) * 0.6).toFixed(3));
      }
      if (stage) {
        var leave = Math.max(0, (p - 0.6) / 0.4);
        stage.style.setProperty('--ss', (1 - leave * 0.06).toFixed(3));
        stage.style.setProperty('--so', (1 - Math.max(0, (p - 0.65) / 0.35)).toFixed(3));
      }
      if (status) status.style.setProperty('--co', (1 - Math.min(1, p / 0.12)).toFixed(3));
      if (dial) {
        dial.setAttribute('data-scrub', p > 0.002 ? '1' : '0');
        if (p > 0.002) dial.textContent = pad(Math.round(p * 36)) + '-' + pad(Math.round(p * 72) % 60) + '-' + pad(Math.round(p * 144) % 60);
      }
    }
    function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* ---------------------------------------------------------------- FAQ: animated open/close */
  function initFaq() {
    $$('.faq details').forEach(function (d) {
      var s = d.querySelector('summary'), a = d.querySelector('.faq-a');
      if (!s || !a) return;
      s.addEventListener('click', function (e) {
        if (REDUCED || d.__anim) { if (d.__anim) e.preventDefault(); return; }
        e.preventDefault();
        d.__anim = true;
        if (d.open) {
          a.style.height = a.offsetHeight + 'px';
          a.style.overflow = 'hidden';
          window.requestAnimationFrame(function () {
            a.style.transition = 'height .35s ease, opacity .3s ease';
            a.style.height = '0px'; a.style.opacity = '0';
          });
          window.setTimeout(function () { d.open = false; a.style.cssText = ''; d.__anim = false; }, 370);
        } else {
          d.open = true;
          var h = a.offsetHeight;
          a.style.height = '0px'; a.style.opacity = '0'; a.style.overflow = 'hidden';
          window.requestAnimationFrame(function () {
            a.style.transition = 'height .42s cubic-bezier(.2,.8,.2,1), opacity .35s ease';
            a.style.height = h + 'px'; a.style.opacity = '1';
          });
          window.setTimeout(function () { a.style.cssText = ''; d.__anim = false; }, 440);
        }
      });
    });
  }

  /* ---------------------------------------------------------------- prefetch internal pages on intent */
  function initPrefetch() {
    var seen = {}, count = 0;
    function want(a) {
      if (!a || count > 24) return null;
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) return null;
      if (a.hasAttribute('download') || a.target === '_blank') return null;
      var u;
      try { u = new URL(a.href, location.href); } catch (e) { return null; }
      if (u.origin !== location.origin) return null;
      if (u.pathname === location.pathname) return null;
      if (/\.(xml|pdf|zip|png|jpg|jpeg|svg|webp|mp4)$/i.test(u.pathname)) return null;
      var key = u.pathname;
      if (seen[key]) return null;
      seen[key] = true; count++;
      return u.pathname;
    }
    function add(path) {
      var l = document.createElement('link');
      l.rel = 'prefetch'; l.href = path; l.as = 'document';
      document.head.appendChild(l);
    }
    function onIntent(e) {
      var a = e.target && e.target.nodeType === 1 ? closest(e.target, 'a[href]') : null;
      var path = want(a);
      if (path) add(path);
    }
    document.addEventListener('pointerover', onIntent, { passive: true });
    document.addEventListener('touchstart', onIntent, { passive: true });
  }

  /* ---------------------------------------------------------------- store micro-interactions */
  function initStoreMotion() {
    var badges = $$('[data-cart-count]');
    if (badges.length && 'MutationObserver' in window) {
      badges.forEach(function (b) {
        new MutationObserver(function () {
          b.classList.remove('bump');
          void b.offsetWidth;
          b.classList.add('bump');
        }).observe(b, { childList: true, characterData: true, subtree: true });
      });
    }
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.nodeType === 1 ? closest(e.target, '[data-store-add]') : null;
      if (!btn || btn.classList.contains('is-added')) return;
      var original = btn.innerHTML;
      btn.classList.add('is-added');
      btn.textContent = 'Added ✓';
      window.setTimeout(function () { btn.innerHTML = original; btn.classList.remove('is-added'); }, 1500);
    });
  }

  /* ---------------------------------------------------------------- tracking */
  function isExternal(a) {
    return /^https?:/i.test(a.href) && a.host && a.host !== location.host;
  }
  function initTracking() {
    document.addEventListener('click', function (e) {
      var tracked = closest(e.target, '[data-track]');
      if (tracked) {
        var name = tracked.getAttribute('data-track');
        var props = {};
        try { props = JSON.parse(tracked.getAttribute('data-track-props') || '{}') || {}; } catch (err) { props = {}; }
        if (name === 'cta_click') {
          if (!props.label) props.label = (tracked.getAttribute('aria-label') || tracked.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
          if (!props.href) props.href = tracked.getAttribute('href') || '';
        }
        window.rvTrack(name, props);
      }
      var a = closest(e.target, 'a[href]');
      if (a && isExternal(a)) window.rvTrack('outbound_click', { href: a.href });
    });
  }

  /* ---------------------------------------------------------------- forms */
  function labelText(el, form) {
    if (el.id) {
      var lab = form.querySelector('label[for="' + el.id + '"]');
      if (lab) return lab.textContent.replace(/\s+/g, ' ').trim();
    }
    return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || 'this field';
  }

  function collect(form) {
    var payload = {}, order = [], problem = null;
    Array.prototype.forEach.call(form.elements, function (el) {
      if (problem) return;
      var name = el.name;
      if (!name || el.disabled || name === '_honey') return;
      var tag = (el.tagName || '').toLowerCase();
      var type = (el.type || '').toLowerCase();
      if (tag === 'button' || type === 'submit' || type === 'button' || type === 'reset') return;
      var value;
      if (type === 'checkbox' || type === 'radio') {
        if (!el.checked) {
          if (el.required && type === 'checkbox') problem = { el: el, msg: el.getAttribute('data-msg-required') || ('PLEASE TICK ' + labelText(el, form).toUpperCase()) };
          return;
        }
        value = el.value || 'yes';
      } else {
        value = String(el.value || '').trim();
      }
      if (el.required && !value) {
        problem = { el: el, msg: el.getAttribute('data-msg-required') || ('PLEASE FILL IN ' + labelText(el, form).toUpperCase()) };
        return;
      }
      if (type === 'email' && value && !EMAIL_RE.test(value)) {
        problem = { el: el, msg: el.getAttribute('data-msg-invalid') || "THAT EMAIL DOESN'T LOOK RIGHT" };
        return;
      }
      if (!value && type === 'email') value = '(not given)';
      if (!(name in payload)) order.push(name);
      payload[name] = value;
    });
    return { payload: payload, order: order, problem: problem };
  }

  function mailtoFallback(form, payload, order, subject) {
    var lines = [];
    if (payload.message) lines.push(payload.message, '');
    order.forEach(function (k) {
      if (k === 'message' || payload[k] === '(not given)' || payload[k] === '') return;
      lines.push((k === 'email' ? '— reply to' : k) + ': ' + payload[k]);
    });
    var body = lines.join('\n').trim();
    window.location.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function bindForm(form) {
    if (form.__rvBound) return;
    form.__rvBound = true;
    var status = form.querySelector('[role="status"]');
    if (!status) {
      status = document.createElement('p');
      status.className = 'form-note';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      form.appendChild(status);
    }
    var btn = form.querySelector('button[type="submit"], input[type="submit"]') || form.querySelector('button');
    var subject = form.getAttribute('data-subject') || 'New message from ravolution.agency';
    var successText = form.getAttribute('data-success') || "SENT — I'LL COME BACK TO YOU SHORTLY";
    var eventName = form.getAttribute('data-event') || '';
    var endpoint = form.getAttribute('data-endpoint') || FORM_ENDPOINT;

    function note(text, state) {
      status.textContent = text;
      if (state) status.setAttribute('data-state', state); else status.removeAttribute('data-state');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var honey = form.querySelector('[name="_honey"]');
      if (honey && honey.value) return; // bot
      var c = collect(form);
      if (c.problem) { c.problem.el.focus(); note(c.problem.msg, 'err'); return; }
      var body = {};
      c.order.forEach(function (k) { body[k] = c.payload[k]; });
      body.page = location.pathname;
      body._subject = subject;
      body._template = 'table';
      body._captcha = 'false';
      body._honey = '';

      if (btn) { btn.disabled = true; btn.classList.add('is-sending'); }
      note('SENDING…', '');
      var sent = false;
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json().catch(function () { return {}; });
      }).then(function (data) {
        if (data && String(data.success) === 'false') throw new Error(data.message || 'rejected');
        sent = true;
        form.reset();
        note(successText, 'ok');
        if (eventName) window.rvTrack(eventName, { form: form.id || subject });
      }).catch(function () {
        if (sent) return;
        mailtoFallback(form, c.payload, c.order, subject);
        note('OPENING YOUR MAIL APP — JUST HIT SEND', 'err');
      }).then(function () {
        if (btn) { btn.disabled = false; btn.classList.remove('is-sending'); }
      });
    });
  }

  function initForms() {
    $$('form[data-form]').forEach(bindForm);
  }

  /* ---------------------------------------------------------------- sticky CTA */
  function initStickyCta() {
    var cta = $('.sticky-cta');
    if (!cta) return;
    var sel = cta.getAttribute('data-hide-when');
    var target = null;
    try { target = sel ? $(sel) : null; } catch (e) { target = null; }
    var targetVisible = false;
    var mq = window.matchMedia ? window.matchMedia('(max-width: 720px)') : { matches: false };

    function refresh() {
      var banner = $('#consent');
      var hide = document.body.classList.contains('menu-open') || targetVisible || !!(banner && !banner.hidden);
      cta.classList.toggle('is-hidden', hide);
      document.body.classList.toggle('has-sticky-cta', !!mq.matches && !hide);
    }
    stickyRefresh = refresh;

    if (target && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var vh = window.innerHeight || 1;
          targetVisible = en.intersectionRatio >= 0.3 || (en.isIntersecting && en.intersectionRect.height >= vh * 0.5);
        });
        refresh();
      }, { threshold: [0, 0.3, 0.31, 0.6, 1] }).observe(target);
    }
    if (mq.addEventListener) mq.addEventListener('change', refresh);
    else if (mq.addListener) mq.addListener(refresh);
    refresh();
  }

  /* ---------------------------------------------------------------- copy */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy failed'));
      } catch (e) { reject(e); }
    });
  }
  function initCopy() {
    document.addEventListener('click', function (e) {
      var b = closest(e.target, '[data-copy]');
      if (!b) return;
      e.preventDefault();
      var text = b.getAttribute('data-copy') || location.href;
      copyText(text).then(function () { window.rvToast('Link copied'); }, function () { window.rvToast('Copy failed — try the address bar'); });
    });
  }

  /* ---------------------------------------------------------------- skip link */
  function initSkipLink() {
    document.addEventListener('click', function (e) {
      var a = closest(e.target, 'a.skip-link, a[href="#main"]');
      if (!a) return;
      var main = $('#main');
      if (!main) return;
      if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
      window.setTimeout(function () { main.focus({ preventScroll: true }); }, 0);
    });
  }

  /* ---------------------------------------------------------------- boot */
  function init() {
    document.documentElement.classList.add('js-ready');
    initPreloader();
    initNav();
    initMenu();
    initReveal();
    initTracking();
    initForms();
    initStickyCta();
    initConsent();
    initCopy();
    initSkipLink();
    initFaq();
    initTilt();
    initMagnetic();
    initCursor();
    initMouseScenes();
    initVaultScroll();
    initPrefetch();
    initStoreMotion();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
