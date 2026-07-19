/* ============================================================
   REHAN ALI — cinematic scroll engine
   Lenis smooth scroll · GSAP ScrollTrigger · canvas orbit scrub
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

// anchor links through Lenis
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const target = $(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: 0, duration: 1.6 });
  });
});

/* ---------------- hero title -> chars ---------------- */
function splitChars(el) {
  const text = el.textContent;
  el.textContent = "";
  return [...text].map((ch) => {
    const s = document.createElement("span");
    s.className = "char";
    s.textContent = ch;
    el.appendChild(s);
    return s;
  });
}
const charsFirst = splitChars($("#lineFirst"));
const charsLast = splitChars($("#lineLast"));
charsLast.forEach((c) => { if (c.textContent === ".") c.classList.add("red"); });
const allChars = [...charsFirst, ...charsLast];
gsap.set(allChars, { yPercent: 120, opacity: 0, rotate: 7 });

/* ---------------- orbit frame sequence ---------------- */
const canvas = $("#orbit");
const ctx = canvas.getContext("2d");
let frames = [];
let frameCount = 0;
let currentFrame = -1;
let frameW = 1600, frameH = 900;

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  currentFrame = -1; // force redraw
}
addEventListener("resize", () => { sizeCanvas(); drawFrame(lastProgressFrame(), true); });

function drawFrame(i, force = false) {
  if (!frameCount) return;
  i = Math.max(0, Math.min(frameCount - 1, i));
  if (i === currentFrame && !force) return;
  const img = frames[i];
  if (!img || !img.complete || !img.naturalWidth) return;
  currentFrame = i;
  // cover-fit
  const cw = canvas.width, ch = canvas.height;
  const scale = Math.max(cw / frameW, ch / frameH);
  const dw = frameW * scale, dh = frameH * scale;
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
}

let heroProgress = 0;
const lastProgressFrame = () => Math.round(heroProgress * (frameCount - 1));

/* ---------------- preloader ---------------- */
const preCount = $("#preCount");
const preBar = $("#preBar");
let siteRevealed = false;

function setLoadProgress(p) {
  const pct = Math.round(p * 100);
  preCount.textContent = String(pct).padStart(2, "0");
  preBar.style.width = pct + "%";
}

function revealSite() {
  if (siteRevealed) return;
  siteRevealed = true;
  document.body.classList.add("ready");
  const pre = $("#preloader");
  pre.classList.add("done");

  const tl = gsap.timeline();
  tl.to(pre, { yPercent: -100, duration: 0.9, ease: "power4.inOut" })
    .set(pre, { display: "none" })
    .to(allChars, {
      yPercent: 0, opacity: 1, rotate: 0,
      duration: 1.1, ease: "power4.out",
      stagger: 0.05,
    }, "-=0.45")
    .from(".hero-sub", { opacity: 0, y: 24, duration: 0.9, ease: "power3.out" }, "-=0.5")
    .from(".hero-hud", { opacity: 0, duration: 0.9, ease: "power2.out" }, "-=0.6");
}

async function loadFrames() {
  try {
    const res = await fetch("assets/frames/manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error("no manifest");
    const m = await res.json();
    frameCount = m.count;
    frameW = m.width || 1600;
    frameH = m.height || 900;

    let loaded = 0;
    const jobs = [];
    for (let i = 0; i < frameCount; i++) {
      const img = new Image();
      img.src = `assets/frames/${m.prefix}${String(i).padStart(m.pad, "0")}${m.ext}${m.v ? `?v=${m.v}` : ""}`;
      frames.push(img);
      jobs.push(new Promise((ok) => {
        img.onload = img.onerror = () => {
          loaded++;
          setLoadProgress(loaded / frameCount);
          if (i === 0) drawFrame(0, true);
          ok();
        };
      }));
    }
    await Promise.all(jobs);
  } catch (e) {
    // frames not generated yet — reveal anyway on a slow fake load
    console.warn("orbit frames unavailable:", e.message);
    await new Promise((ok) => {
      let p = 0;
      const t = setInterval(() => {
        p += 0.13;
        setLoadProgress(Math.min(p, 1));
        if (p >= 1) { clearInterval(t); ok(); }
      }, 90);
    });
  }
  revealSite();
}

sizeCanvas();
loadFrames();

/* ---------------- hero scroll choreography ---------------- */
const degCount = $("#degCount");
const centerF = (charsFirst.length - 1) / 2;
const centerL = (charsLast.length - 1) / 2;

ScrollTrigger.create({
  trigger: "#hero",
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    heroProgress = self.progress;

    // letters track outward as the orbit turns, fade near the end
    const spread = gsap.parseEase("power1.inOut")(heroProgress);
    const fade = gsap.utils.clamp(0, 1, (heroProgress - 0.62) / 0.28);
    charsFirst.forEach((c, i) => {
      gsap.set(c, { x: (i - centerF) * spread * 90, opacity: 1 - fade });
    });
    charsLast.forEach((c, i) => {
      gsap.set(c, { x: (i - centerL) * spread * 140, opacity: 1 - fade });
    });

    // subtitle + hud drift away mid-orbit
    gsap.set(".hero-sub", { opacity: 1 - gsap.utils.clamp(0, 1, (heroProgress - 0.38) / 0.2) });
    gsap.set(".hud-scroll", { opacity: 1 - gsap.utils.clamp(0, 1, heroProgress / 0.12) });
  },
});

/* ============================================================
   HERO ATMOSPHERE — aurora gradients · depth particles · parallax
   Colour customization: tweak AURORA + PARTICLE_TINTS below.
   ============================================================ */
const ATMOSPHERE_ON = true;
const AURORA_ON = false;     // parked — colour fields off
const PARTICLES_ON = false;  // parked — dust off
const GLOW_ON = true;        // the breathing light stays

const AURORA = [
  { rgb: "232,16,46",   alpha: 0.075, x: 0.20, y: 0.30, r: 0.55, spd: 0.020, ph: 0.0 }, // crimson
  { rgb: "244,236,221", alpha: 0.034, x: 0.80, y: 0.22, r: 0.50, spd: 0.015, ph: 2.1 }, // cream
  { rgb: "92,116,168",  alpha: 0.050, x: 0.50, y: 0.80, r: 0.60, spd: 0.011, ph: 4.2 }, // cool slate
];
const PARTICLE_TINTS = [
  { rgb: "244,236,221", weight: 0.85 }, // cream dust
  { rgb: "232,16,46",   weight: 0.15 }, // rare red spark
];

const atm = document.createElement("canvas");
atm.width = 1280; atm.height = 720;
const atmCtx = atm.getContext("2d");

// pre-rendered glow sprites (cheap glow, no per-particle shadowBlur)
function makeSprite(rgb) {
  const s = document.createElement("canvas");
  s.width = s.height = 48;
  const c = s.getContext("2d");
  const g = c.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.35, `rgba(${rgb},0.45)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(0, 0, 48, 48);
  return s;
}
const sprites = PARTICLE_TINTS.map((t) => makeSprite(t.rgb));

const P_COUNT = innerWidth < 700 ? 36 : 72;
const particles = [];
for (let i = 0; i < P_COUNT; i++) {
  const tint = Math.random() < PARTICLE_TINTS[0].weight ? 0 : 1;
  const depth = 0.35 + Math.random() * 0.65; // 0.35 far … 1 near
  particles.push({
    x0: Math.random(),
    y0: Math.random(),
    spd: (0.006 + Math.random() * 0.012) * depth, // near = faster
    sway: 0.4 + Math.random() * 0.8,
    ph: Math.random() * Math.PI * 2,
    size: (2.5 + Math.random() * 7) * depth,
    alpha: (0.10 + Math.random() * 0.30) * depth,
    depth, tint,
  });
}

// mouse parallax (lerped for smoothness)
let paraTarget = 0, para = 0, paraTargetY = 0, paraY = 0;
addEventListener("pointermove", (e) => {
  paraTarget = e.clientX / innerWidth - 0.5;
  paraTargetY = e.clientY / innerHeight - 0.5;
}, { passive: true });

let atmT0 = null;

function paintAtmosphere(time) {
  const w = atm.width, h = atm.height;
  para += (paraTarget - para) * 0.04;
  paraY += (paraTargetY - paraY) * 0.04;
  atmCtx.globalCompositeOperation = "source-over";
  atmCtx.clearRect(0, 0, w, h);
  atmCtx.globalCompositeOperation = "lighter";

  // slow-morphing aurora blobs
  const t = reduceMotion ? 0 : time;
  for (const b of (AURORA_ON ? AURORA : [])) {
    const cx = (b.x + 0.07 * Math.sin(t * b.spd * 6.283 + b.ph) - para * 0.03 * (1 / b.r)) * w;
    const cy = (b.y + 0.05 * Math.cos(t * b.spd * 5.1 + b.ph) - paraY * 0.02) * h;
    const alpha = b.alpha * (0.75 + 0.25 * Math.sin(t * 0.09 + b.ph));
    const g = atmCtx.createRadialGradient(cx, cy, 0, cx, cy, b.r * w);
    g.addColorStop(0, `rgba(${b.rgb},${alpha})`);
    g.addColorStop(1, `rgba(${b.rgb},0)`);
    atmCtx.fillStyle = g;
    atmCtx.fillRect(0, 0, w, h);
  }

  // breathing light behind the subject
  if (GLOW_ON) {
    const breathe = 0.10 + (reduceMotion ? 0 : 0.055 * Math.sin(t * 0.9));
    const bg = atmCtx.createRadialGradient(w * 0.5, h * 0.52, 0, w * 0.5, h * 0.52, w * 0.44);
    bg.addColorStop(0, `rgba(255,240,214,${breathe})`);
    bg.addColorStop(0.55, `rgba(255,236,205,${breathe * 0.45})`);
    bg.addColorStop(1, "rgba(255,240,214,0)");
    atmCtx.fillStyle = bg;
    atmCtx.fillRect(0, 0, w, h);
  }

  // depth particle field
  for (const p of (PARTICLES_ON ? particles : [])) {
    const drift = reduceMotion ? 0 : t * p.spd;
    const y = ((p.y0 - drift) % 1 + 1) % 1;
    const x = p.x0 + (reduceMotion ? 0 : 0.014 * Math.sin(t * p.sway + p.ph)) + para * 0.06 * p.depth;
    atmCtx.globalAlpha = p.alpha * (0.6 + 0.4 * Math.sin(t * 0.8 + p.ph));
    atmCtx.drawImage(sprites[p.tint], x * w - p.size / 2, y * h - p.size / 2, p.size, p.size);
  }
  atmCtx.globalAlpha = 1;

  // keep the subject zone clean (only needed when the busy layers are on —
  // the solo backlight is meant to wash over him like a real studio light)
  if (AURORA_ON || PARTICLES_ON) {
    atmCtx.globalCompositeOperation = "destination-out";
    const pr = atmCtx.createRadialGradient(w * 0.5, h * 0.55, w * 0.10, w * 0.5, h * 0.55, w * 0.34);
    pr.addColorStop(0, "rgba(0,0,0,0.9)");
    pr.addColorStop(1, "rgba(0,0,0,0)");
    atmCtx.fillStyle = pr;
    atmCtx.fillRect(0, 0, w, h);
  }
}

function renderHero(idx, time) {
  drawFrame(idx, true);
  if (!ATMOSPHERE_ON) return;
  if (atmT0 === null) atmT0 = time;
  paintAtmosphere(time);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = Math.min(1, (time - atmT0) / 1.6) * 0.92; // fade in on load
  ctx.drawImage(atm, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/* ---------------- pendulum sway: the hero drifts on its own ---------------- */
const SWAY_AMP = 26;    // frames of drift either side (~60 degrees)
const SWAY_PERIOD = 9;  // seconds per full sway cycle
const heroEl = $("#hero");

gsap.ticker.add((time) => {
  if (!frameCount || !siteRevealed) return;
  if (window.scrollY > heroEl.offsetHeight) return; // hero off-screen, save work
  const sway = reduceMotion ? 0 : Math.sin((time % SWAY_PERIOD) / SWAY_PERIOD * Math.PI * 2) * SWAY_AMP;
  const base = Math.round(heroProgress * (frameCount - 1));
  const idx = (((base + Math.round(sway)) % frameCount) + frameCount) % frameCount;
  renderHero(idx, time);
  degCount.textContent = String(Math.round((idx / (frameCount - 1)) * 360) % 361).padStart(3, "0");
});

/* ---------------- dossier HUD: classified-file readouts ---------------- */
const dossier = $("#dossier");
const D_LINES = [
  ["ASSET", "REHAN ALI"],
  ["LOCATION", "EDINBURGH, UK"],
  ["VENTURES", "02 LIVE"],
  ["PRODUCTS", "40+ SHIPPED"],
];
const D_STATUSES = ["BUILDING", "SELLING", "CLOSING", "REPEATING"];
const SCRAMBLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/\\|<>_";

function decodeInto(el, text, done) {
  let shown = 0;
  const iv = setInterval(() => {
    shown++;
    let out = text.slice(0, shown);
    for (let i = shown; i < text.length; i++) {
      out += text[i] === " " ? " " : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
    }
    el.textContent = out;
    if (shown >= text.length) { clearInterval(iv); done && done(); }
  }, 28);
}

if (dossier) {
  D_LINES.forEach(([k]) => {
    const row = document.createElement("div");
    row.className = "d-line";
    row.innerHTML = `<span class="d-k">${k}:</span> <span class="d-v"></span>`;
    dossier.appendChild(row);
  });
  const st = document.createElement("div");
  st.className = "d-line";
  st.innerHTML = `<span class="d-k">STATUS:</span> <span class="d-v" id="dStatus"></span><i class="d-cursor"></i>`;
  dossier.appendChild(st);

  const typeDossier = (i = 0) => {
    if (i < D_LINES.length) {
      const v = dossier.querySelectorAll(".d-v")[i];
      dossier.children[i].classList.add("on");
      decodeInto(v, D_LINES[i][1], () => typeDossier(i + 1));
    } else {
      dossier.children[D_LINES.length].classList.add("on");
      cycleStatus(0);
    }
  };
  const cycleStatus = (i) => {
    decodeInto($("#dStatus"), D_STATUSES[i % D_STATUSES.length], () => {
      setTimeout(() => cycleStatus(i + 1), 2600);
    });
  };
  const dossierKick = setInterval(() => {
    if (siteRevealed) { clearInterval(dossierKick); setTimeout(() => typeDossier(), 800); }
  }, 200);
}

/* ---------------- split-flap board ---------------- */
const FLAP_MSGS = [
  "I SELL DIGITAL PRODUCTS & SERVICES",
  "BUILDER OF NEVERMISSED",
  "40+ DIGITAL PRODUCTS SHIPPED",
  "SELLS WHILE HE SLEEPS",
];
const FLAP_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&+.-'";
const board = $("#flapBoard");

if (board) {
  const LEN = Math.max(...FLAP_MSGS.map((m) => m.length));
  const padMsg = (m) => {
    const lead = Math.floor((LEN - m.length) / 2);
    return (" ".repeat(lead) + m).padEnd(LEN, " ");
  };
  const cells = [];
  let cur = padMsg(FLAP_MSGS[0]);
  for (let i = 0; i < LEN; i++) {
    const c = document.createElement("span");
    c.className = "flap-cell";
    c.textContent = cur[i];
    board.appendChild(c);
    cells.push(c);
  }

  let flapTimers = [];
  function settleBoard() {
    flapTimers.forEach((id) => { clearTimeout(id); clearInterval(id); });
    flapTimers = [];
    cells.forEach((cell, i) => { cell.textContent = cur[i]; cell.classList.remove("flip"); });
  }

  function flipTo(msg) {
    settleBoard(); // finish any in-flight flip instantly before starting
    const target = padMsg(msg);
    cells.forEach((cell, i) => {
      const from = cur[i], to = target[i];
      if (from === to) return;
      const startI = Math.max(0, FLAP_CHARS.indexOf(from));
      const endI = Math.max(0, FLAP_CHARS.indexOf(to));
      const dist = (((endI - startI) % FLAP_CHARS.length) + FLAP_CHARS.length) % FLAP_CHARS.length;
      const steps = Math.max(2, Math.min(dist, 7 + (i % 5)));
      let step = 0;
      const to_id = setTimeout(() => {
        const iv = setInterval(() => {
          step++;
          const ci = (startI + Math.round((dist * step) / steps)) % FLAP_CHARS.length;
          cell.textContent = FLAP_CHARS[ci];
          cell.classList.add("flip");
          setTimeout(() => cell.classList.remove("flip"), 55);
          if (step >= steps) { clearInterval(iv); cell.textContent = to; }
        }, 42);
        flapTimers.push(iv);
      }, i * 24);
      flapTimers.push(to_id);
    });
    cur = target;
  }

  if (!reduceMotion) {
    let fi = 0;
    setInterval(() => {
      if (document.hidden) return; // don't churn in background tabs
      fi = (fi + 1) % FLAP_MSGS.length;
      flipTo(FLAP_MSGS[fi]);
    }, 4200);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) settleBoard(); });
  }
}

/* ---------------- 02 · NUMBERS — declassification pass ---------------- */
const numbersEl = $("#numbers");
const numScan = $(".num-scan");
const numFlashEl = $(".num-flash");
const stampEl = $(".stamp");
const statList = $$(".stat");
const STAT_STATUS = ["● VERIFIED", "● VERIFIED", "● VERIFIED", "● NO TEAM DETECTED"];
let numActive = false;
let lockedCount = 0;

if (reduceMotion || !numbersEl) {
  /* reduced motion: the previously shipped behavior, verbatim */
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
  statList.forEach((el, i) => {
    gsap.from(el, {
      opacity: 0, y: 60, duration: 1, ease: "power3.out", delay: i * 0.08,
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });
  if (stampEl) {
    ScrollTrigger.create({
      trigger: stampEl, start: "top 92%", once: true,
      onEnter: () => gsap.set(stampEl, { opacity: 0.5 }),
    });
  }
} else {
  /* master trigger: scan band position + marquee skew + idle gating,
     all fed by the one ScrollTrigger so the section costs nothing off-screen */
  let scanRange = 0;
  const cacheScanRange = () => { scanRange = numbersEl.offsetHeight + 90; };
  cacheScanRange();
  ScrollTrigger.addEventListener("refreshInit", cacheScanRange);

  gsap.set(".marquee", { scaleX: 1.02 }); // covers shear gaps at max skew
  const skewTo = gsap.quickTo(".marquee", "skewX", { duration: 0.5, ease: "power3" });
  numbersEl.classList.add("is-offscreen");

  ScrollTrigger.create({
    trigger: "#numbers",
    start: "top bottom",
    end: "bottom top",
    onUpdate: (self) => {
      gsap.set(numScan, {
        y: self.progress * scanRange,
        opacity: self.progress > 0.01 && self.progress < 0.99 ? 1 : 0,
      });
      skewTo(gsap.utils.clamp(-6, 6, self.getVelocity() / -140));
    },
    onToggle: (self) => {
      numActive = self.isActive;
      numbersEl.classList.toggle("is-offscreen", !self.isActive);
      if (!self.isActive) skewTo(0);
    },
  });

  /* file header decodes in the dossier's voice */
  const eyebrowTxt = $("#numbers .eyebrow-txt");
  const fileTag = $("#numbers .file-tag");
  ScrollTrigger.create({
    trigger: ".stats-wrap", start: "top 85%", once: true,
    onEnter: () => decodeInto(eyebrowTxt, "THE NUMBERS", () => {
      const txt = document.createElement("span");
      fileTag.appendChild(txt);
      fileTag.appendChild(document.createElement("i"));
      decodeInto(txt, "// FILE 02-A · CLEARANCE: PUBLIC");
    }),
  });

  /* a tile locking = suffix flap-punch, settle thunk, border stamp, chip, stamp counter */
  const lockTile = (stat, i) => {
    const sup = stat.querySelector(".stat-num sup");
    if (sup) {
      gsap.fromTo(sup,
        { scaleY: 0, opacity: 0 },
        { scaleY: 1, opacity: 1, duration: 0.38, ease: "back.out(2.6)", transformOrigin: "50% 100%" });
      sup.classList.add("sup-flash");
      setTimeout(() => sup.classList.remove("sup-flash"), 90);
    }
    gsap.fromTo(stat, { y: 0 }, { y: 3, duration: 0.07, ease: "power2.in", yoyo: true, repeat: 1 });
    stat.classList.add("stat--lit");
    setTimeout(() => stat.classList.remove("stat--lit"), 250);
    stat.dataset.locked = "1";
    const ssTxt = stat.querySelector(".ss-txt");
    if (ssTxt) setTimeout(() => decodeInto(ssTxt, STAT_STATUS[i] || STAT_STATUS[0]), 250);
    if (++lockedCount === statList.length && stampEl) {
      gsap.timeline()
        .fromTo(stampEl,
          { opacity: 0, scale: 2.1, rotate: -3 },
          { opacity: 0.9, scale: 1, rotate: -8, duration: 0.28, ease: "power4.in" })
        .to(stampEl, { opacity: 0.55, duration: 0.5, ease: "power2.out" })
        .fromTo(numFlashEl, { opacity: 0.14 }, { opacity: 0, duration: 0.4, ease: "power1.out" }, 0.26);
    }
  };

  statList.forEach((stat, i) => {
    /* injected decor: corner brackets, redaction bar, status chip */
    const corners = document.createElement("i");
    corners.className = "corners";
    corners.setAttribute("aria-hidden", "true");
    for (let c = 0; c < 4; c++) {
      const b = document.createElement("b");
      b.innerHTML = '<u class="h"></u><u class="v"></u>';
      corners.appendChild(b);
    }
    stat.appendChild(corners);

    const redact = document.createElement("i");
    redact.className = "redact";
    redact.setAttribute("aria-hidden", "true");
    stat.querySelector(".stat-label").appendChild(redact);

    const chip = document.createElement("div");
    chip.className = "stat-status";
    chip.setAttribute("aria-hidden", "true");
    chip.innerHTML = '<span class="ss-txt"></span><i class="ss-cursor"></i>';
    stat.appendChild(chip);

    const sup = stat.querySelector(".stat-num sup");
    if (sup) gsap.set(sup, { opacity: 0 });

    const countEl = stat.querySelector(".count");
    const target = parseFloat(countEl.dataset.target);
    const str = String(target);
    countEl.style.display = "inline-block";
    countEl.style.minWidth = str.length + "ch"; // scramble at final width, no jitter
    const obj = { v: 0 };
    const hSegs = stat.querySelectorAll(".corners u.h");
    const vSegs = stat.querySelectorAll(".corners u.v");

    const tl = gsap.timeline({
      delay: i * 0.12,
      scrollTrigger: { trigger: stat, start: "top 82%", once: true },
    });
    tl.from(stat, { y: 40, opacity: 0, duration: 0.7, ease: "power3.out" }, 0)
      .fromTo(hSegs, { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "power3.out", stagger: 0.04 }, 0)
      .fromTo(vSegs, { scaleY: 0 }, { scaleY: 1, duration: 0.35, ease: "power3.out", stagger: 0.04 }, 0)
      .to(redact, { backgroundColor: "#e8102e", duration: 0.12, ease: "steps(1)" }, 0.25)
      .to(redact, { scaleX: 0, duration: 0.5, ease: "power2.inOut" }, 0.37)
      .to(obj, {
        v: target, duration: 1.6, ease: "power3.out",
        onUpdate() {
          /* decrypt, don't count: digits lock left-to-right over the tween */
          const p = this.progress();
          const cur = String(Math.round(obj.v)).padStart(str.length, "0");
          const lockedN = Math.floor(p * str.length + 0.3);
          let out = cur.slice(0, lockedN);
          for (let d = lockedN; d < str.length; d++) {
            out += p < 1 ? "0123456789"[(Math.random() * 10) | 0] : cur[d];
          }
          countEl.textContent = out;
        },
        onComplete() { countEl.textContent = str; lockTile(stat, i); },
      }, 0.35);
  });

  /* idle life: censor-pen ink passes on the marquee, glitch ticks on locked numerals.
     Both no-op unless the section is on screen and the tab is visible. */
  const mqWords = [];
  $$(".marquee-track span").forEach((span) => {
    [...span.childNodes].forEach((node) => {
      if (node.nodeType !== 3 || !node.textContent.trim()) return;
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((tok) => {
        if (!tok) return;
        if (tok.trim()) {
          const b = document.createElement("b");
          b.textContent = tok;
          frag.appendChild(b);
          mqWords.push(b);
        } else {
          frag.appendChild(document.createTextNode(tok));
        }
      });
      span.replaceChild(frag, node);
    });
  });
  setInterval(() => {
    if (!numActive || document.hidden || !mqWords.length) return;
    const el = mqWords[(Math.random() * mqWords.length) | 0];
    el.classList.add("mq-hit");
    gsap.fromTo(el, { x: -1 }, {
      x: 0, duration: 0.16, ease: "steps(2)",
      onComplete: () => el.classList.remove("mq-hit"),
    });
  }, 4000);
  setInterval(() => {
    if (!numActive || document.hidden) return;
    const lockedTiles = statList.filter((s) => s.dataset.locked === "1");
    if (!lockedTiles.length) return;
    const el = lockedTiles[(Math.random() * lockedTiles.length) | 0].querySelector(".count");
    el.classList.add("num-glitch");
    gsap.fromTo(el, { skewX: 6, x: -2 }, {
      skewX: 0, x: 0, duration: 0.12, ease: "steps(2)", clearProps: "transform",
      onComplete: () => el.classList.remove("num-glitch"),
    });
  }, 4300);
}

/* ---------------- pillars ---------------- */
const pillars = $$(".pillar");
const pillarStep = $("#pillarStep");
gsap.set(pillars, { autoAlpha: 0 });

const pillarTl = gsap.timeline({
  scrollTrigger: {
    trigger: "#pillars",
    start: "top top",
    end: "bottom bottom",
    scrub: 0.6,
    onUpdate: (self) => {
      const step = Math.min(2, Math.floor(self.progress * 3));
      pillarStep.textContent = String(step + 1).padStart(2, "0");
    },
  },
});

pillars.forEach((p, i) => {
  const title = $(".pillar-title", p);
  const pitch = $(".pillar-pitch", p);
  const rule = $(".pillar-rule", p);
  const idx = $(".pillar-idx", p);

  pillarTl
    .fromTo(p, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.55, ease: "none" })
    .fromTo(title, { y: 90 }, { y: 0, duration: 0.55, ease: "power2.out" }, "<")
    .fromTo(idx, { yPercent: -30 }, { yPercent: -50, duration: 1.6, ease: "none" }, "<")
    .fromTo(pitch, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power2.out" }, "<0.12")
    .fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power2.out" }, "<0.08")
    .to({}, { duration: 0.6 }); // hold
  if (i < pillars.length - 1) {
    pillarTl.to(p, { autoAlpha: 0, y: -50, duration: 0.5, ease: "power2.in" });
  }
});

/* ---------------- background videos: play only in view ---------------- */
[["#builderVideo", "#pillars"], ["#closerVideo", "#work"]].forEach(([vidSel, secSel]) => {
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

/* ---------------- work cards: tilt + glow ---------------- */
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

/* ---------------- magnetic buttons ---------------- */
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

/* ---------------- scroll progress bar ---------------- */
const progressBar = $("#scrollProgress");
ScrollTrigger.create({
  start: 0,
  end: () => ScrollTrigger.maxScroll(window),
  onUpdate: (self) => { progressBar.style.transform = `scaleX(${self.progress})`; },
});

/* ---------------- section reveals ---------------- */
/* ---------------- custom cursor: dot + morphing pill (parked) ---------------- */
const CURSOR_ON = false;
if (CURSOR_ON && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  document.body.classList.add("has-cursor");
  const dot = document.createElement("div"); dot.id = "cursorDot";
  const ring = document.createElement("div"); ring.id = "cursorRing";
  const label = document.createElement("span"); ring.appendChild(label);
  document.body.appendChild(dot); document.body.appendChild(ring);

  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
  let seen = false;
  addEventListener("pointermove", (e) => {
    mx = e.clientX; my = e.clientY;
    if (!seen) { seen = true; rx = mx; ry = my; document.body.classList.add("cursor-on"); }
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => document.body.classList.remove("cursor-on"));
  document.documentElement.addEventListener("pointerenter", () => { if (seen) document.body.classList.add("cursor-on"); });

  gsap.ticker.add(() => {
    dot.style.transform = `translate(${mx}px, ${my}px)`;
    rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
  });

  const LABELS = [
    [".soc-row", "FOLLOW"],
    [".pillar-link", "GO"],
    [".btn", "ENTER"],
    [".card", "SOON"],
  ];
  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest("[data-cursor], .soc-row, .pillar-link, .btn, .card, a, button");
    if (!el) { ring.className = ""; return; }
    const custom = el.getAttribute && el.getAttribute("data-cursor");
    const hit = custom ? [null, custom] : LABELS.find(([sel]) => el.matches(sel));
    if (hit) {
      label.textContent = hit[1];
      ring.className = "is-pill";
    } else {
      ring.className = "is-grow"; // plain links: ring grows, no label
    }
  });
  document.addEventListener("pointerout", (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest("[data-cursor], .soc-row, .pillar-link, .btn, .card, a, button")) {
      ring.className = "";
    }
  });
}

/* ---------------- socials auto-spotlight ---------------- */
const socRows = $$(".soc-row");

/* glitch layers read the name from data-text */
socRows.forEach((r) => {
  const name = r.querySelector(".soc-name");
  if (name) name.setAttribute("data-text", name.textContent.trim());
});

if (socRows.length && !reduceMotion) {
  let litIdx = -1;
  let socHover = false;
  let socActive = false;
  socRows.forEach((r) => {
    r.addEventListener("pointerenter", () => {
      socHover = true;
      if (litIdx >= 0) socRows[litIdx].classList.remove("lit");
    });
    r.addEventListener("pointerleave", () => { socHover = false; });
  });
  setInterval(() => {
    if (!socActive || socHover || document.hidden) return;
    if (litIdx >= 0) socRows[litIdx].classList.remove("lit");
    litIdx = (litIdx + 1) % socRows.length;
    socRows[litIdx].classList.add("lit");
  }, 2500);
  ScrollTrigger.create({
    trigger: "#socials",
    start: "top 80%",
    end: "bottom top",
    onEnter: () => { socActive = true; },
    onEnterBack: () => { socActive = true; },
    onLeave: () => { socActive = false; if (litIdx >= 0) socRows[litIdx].classList.remove("lit"); },
    onLeaveBack: () => { socActive = false; if (litIdx >= 0) socRows[litIdx].classList.remove("lit"); },
  });
}

gsap.utils.toArray(".soc-side").forEach((side, sideI) => {
  const dir = sideI === 0 ? -70 : 70;
  gsap.utils.toArray(".soc-row", side).forEach((el, i) => {
    gsap.from(el, {
      x: dir, opacity: 0, duration: 0.9, ease: "power3.out", delay: i * 0.09,
      scrollTrigger: { trigger: ".soc-split", start: "top 85%", once: true },
    });
  });
  gsap.from([side.querySelector(".soc-group-label"), side.querySelector(".soc-side-sub")], {
    opacity: 0, y: 24, duration: 0.8, ease: "power3.out", stagger: 0.08,
    scrollTrigger: { trigger: ".soc-split", start: "top 88%", once: true },
  });
});

/* ---------------- contact: ask-me-anything -> opens a pre-filled email ---------------- */
const CONTACT_EMAIL = "rainnovation@mail.com";
const amaForm = $("#amaForm");
if (amaForm) {
  amaForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const msgEl = $("#amaMsg");
    const msg = msgEl.value.trim();
    if (!msg) { msgEl.focus(); return; }
    const from = $("#amaFrom").value.trim();
    const subject = "Question from your site";
    const body = msg + (from ? `\n\n— reply to: ${from}` : "");
    window.location.href =
      `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const note = $("#amaNote");
    if (note) note.textContent = "OPENING YOUR MAIL APP — JUST HIT SEND";
  });
}

[".work-heading", ".soc-heading", ".finale-title .line", ".finale-sub", ".finale-cta",
 ".contact-title .line", ".contact-sub", ".ama-form", ".contact-direct"].forEach((sel) => {
  gsap.utils.toArray(sel).forEach((el) => {
    gsap.from(el, {
      y: 90, opacity: 0, duration: 1.1, ease: "power4.out",
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });
});
gsap.utils.toArray(".card").forEach((el, i) => {
  gsap.from(el, {
    y: 80, opacity: 0, duration: 1, ease: "power3.out", delay: i * 0.1,
    scrollTrigger: { trigger: "#work .cards", start: "top 85%", once: true },
  });
});
