/* ============================================================
   RAVOLUTION VAULTS — scroll + interaction engine
   ============================================================ */

gsap.registerPlugin(ScrollTrigger);

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- Lenis smooth scroll ---------------- */
const lenis = new Lenis({
  duration: 1.15,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: !reduceMotion,
});
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

$$('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const target = $(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { duration: 1.5 });
  });
});

/* ---------------- hero: door spins as you scroll ---------------- */
const dial = $("#dialRead");

ScrollTrigger.create({
  trigger: "#hero",
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    const p = self.progress;
    // handle turns two full revolutions across the hero
    gsap.set("#doorHandle", { rotate: p * 720 });
    // door slowly grows + brightens as if approaching it
    gsap.set(".door", { scale: 1 + p * 0.5, opacity: 1 - Math.max(0, (p - 0.75) / 0.25) * 0.6 });
    // combination readout ticks like a dial
    const a = String(Math.round(p * 36)).padStart(2, "0");
    const b = String(Math.round(p * 72) % 60).padStart(2, "0");
    const c = String(Math.round(p * 144) % 60).padStart(2, "0");
    dial.textContent = `${a}-${b}-${c}`;
    gsap.set(".hud-scroll", { opacity: 1 - Math.min(1, p / 0.12) });
  },
});

// intro
gsap.from(".hero-title", { y: 90, opacity: 0, duration: 1.2, ease: "power4.out", delay: 0.15 });
gsap.from(".hero-kicker", { opacity: 0, duration: 1, delay: 0.5 });
gsap.from(".hero-sub", { opacity: 0, y: 20, duration: 1, ease: "power3.out", delay: 0.55 });
gsap.from(".door", { scale: 0.85, opacity: 0, duration: 1.6, ease: "power3.out" });

/* ---------------- vault accordions ---------------- */
$$("[data-vault]").forEach((vault) => {
  $(".vault-head", vault).addEventListener("click", () => {
    const wasOpen = vault.classList.contains("open");
    $$("[data-vault].open").forEach((v) => v.classList.remove("open"));
    if (!wasOpen) {
      vault.classList.add("open");
      // keep the opened vault in view
      setTimeout(() => lenis.scrollTo(vault, { offset: -90, duration: 0.9 }), 80);
    }
  });
});

/* ---------------- payhip placeholder ---------------- */
// Once the Payhip account exists, each UNLOCK link gets its real
// product URL (or the Payhip overlay embed). Until then: no-op.
$$("[data-payhip]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    if (btn.getAttribute("href") === "#") {
      e.preventDefault();
      btn.textContent = "SOON";
      setTimeout(() => (btn.textContent = "UNLOCK"), 1200);
    }
  });
});

/* ---------------- merged from portfolio: stats count-up ---------------- */
$$(".count").forEach((el) => {
  const target = parseFloat(el.dataset.target);
  const obj = { v: 0 };
  gsap.to(obj, {
    v: target,
    duration: 1.8,
    ease: "power3.out",
    scrollTrigger: { trigger: el, start: "top 85%", once: true },
    onUpdate: () => { el.textContent = Math.round(obj.v); },
  });
});
gsap.utils.toArray(".stat").forEach((el, i) => {
  gsap.from(el, {
    opacity: 0, y: 60, duration: 1, ease: "power3.out", delay: i * 0.08,
    scrollTrigger: { trigger: el, start: "top 88%", once: true },
  });
});

/* ---------------- merged: background videos play only in view ---------------- */
[["#builderVideo", "#ventures"], ["#closerVideo", "#drops"]].forEach(([vidSel, secSel]) => {
  const vid = $(vidSel);
  if (!vid) return;
  ScrollTrigger.create({
    trigger: secSel,
    start: "top bottom",
    end: "bottom top",
    onEnter: () => vid.play().catch(() => {}),
    onEnterBack: () => vid.play().catch(() => {}),
    onLeave: () => vid.pause(),
    onLeaveBack: () => vid.pause(),
  });
});

/* ---------------- merged: card tilt + glow ---------------- */
$$(".card").forEach((card) => {
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    card.style.setProperty("--mx", px * 100 + "%");
    card.style.setProperty("--my", py * 100 + "%");
    gsap.to(card, {
      rotateY: (px - 0.5) * 8,
      rotateX: (0.5 - py) * 8,
      y: -6,
      transformPerspective: 800,
      duration: 0.4,
      ease: "power2.out",
    });
  });
  card.addEventListener("pointerleave", () => {
    gsap.to(card, { rotateX: 0, rotateY: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.55)" });
  });
});

/* ---------------- merged: magnetic buttons ---------------- */
$$(".btn").forEach((btn) => {
  btn.addEventListener("pointermove", (e) => {
    const r = btn.getBoundingClientRect();
    gsap.to(btn, {
      x: (e.clientX - r.left - r.width / 2) * 0.22,
      y: (e.clientY - r.top - r.height / 2) * 0.32,
      duration: 0.4, ease: "power3.out",
    });
  });
  btn.addEventListener("pointerleave", () => {
    gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" });
  });
});

/* ---------------- merged: scroll progress bar ---------------- */
const progressBar = $("#scrollProgress");
if (progressBar) {
  ScrollTrigger.create({
    start: 0,
    end: () => ScrollTrigger.maxScroll(window),
    onUpdate: (self) => { progressBar.style.transform = `scaleX(${self.progress})`; },
  });
}

/* ---------------- merged: cards + drops heading reveals ---------------- */
gsap.utils.toArray(".cards .card").forEach((el, i) => {
  gsap.from(el, {
    y: 80, opacity: 0, duration: 1, ease: "power3.out", delay: (i % 3) * 0.1,
    scrollTrigger: { trigger: el.parentElement, start: "top 85%", once: true },
  });
});
gsap.utils.toArray(".drops-heading").forEach((el) => {
  gsap.from(el, {
    y: 90, opacity: 0, duration: 1.1, ease: "power4.out",
    scrollTrigger: { trigger: el, start: "top 88%", once: true },
  });
});

/* ---------------- section reveals ---------------- */
gsap.utils.toArray(".vault").forEach((el, i) => {
  gsap.from(el, {
    y: 60, opacity: 0, duration: 0.9, ease: "power3.out",
    scrollTrigger: { trigger: el, start: "top 92%", once: true },
  });
});
gsap.utils.toArray(".how-step").forEach((el, i) => {
  gsap.from(el, {
    y: 60, opacity: 0, duration: 0.9, ease: "power3.out", delay: i * 0.1,
    scrollTrigger: { trigger: "#how", start: "top 80%", once: true },
  });
});
[".finale-title .line", ".finale-sub", ".finale-cta"].forEach((sel) => {
  gsap.utils.toArray(sel).forEach((el) => {
    gsap.from(el, {
      y: 80, opacity: 0, duration: 1.1, ease: "power4.out",
      scrollTrigger: { trigger: el, start: "top 90%", once: true },
    });
  });
});
