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
  drawFrame(idx);
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

/* ---------------- stats count-up ---------------- */
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
/* ---------------- socials auto-spotlight ---------------- */
const socRows = $$(".soc-row");
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

gsap.utils.toArray(".soc-group").forEach((group) => {
  gsap.utils.toArray(".soc-row", group).forEach((el, i) => {
    gsap.from(el, {
      x: -70, opacity: 0, duration: 0.9, ease: "power3.out", delay: i * 0.09,
      scrollTrigger: { trigger: group, start: "top 85%", once: true },
    });
  });
  const label = group.querySelector(".soc-group-label");
  gsap.from(label, {
    opacity: 0, y: 24, duration: 0.8, ease: "power3.out",
    scrollTrigger: { trigger: group, start: "top 88%", once: true },
  });
});

[".work-heading", ".soc-heading", ".finale-title .line", ".finale-sub", ".finale-cta"].forEach((sel) => {
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
