/* roller.js — PLACEHOLDER renderer (a plain rotating band of words).
   The chosen roller design replaces this file wholesale. Interface:
   window.createRoller({words, font, colors, mode}) -> { resize(w,h,dpr), draw(ctx, angleDeg, timeSec, intensity) } */
(function () {
  "use strict";
  window.createRoller = function (opts) {
    const words = (opts.words && opts.words.length ? opts.words : ["SELL", "BUILD", "CLOSE", "REPEAT"]).map(String);
    const font = opts.font || '"Anton", Impact, sans-serif';
    const c = Object.assign({ ink: "#0b0a08", cream: "#f4ecdd", red: "#e8102e", green: "#2de282" }, opts.colors || {});
    const ambient = opts.mode === "ambient";
    let W = 0, H = 0, DPR = 1, sprites = [], total = 0;

    function resize(w, h, dpr) {
      W = w; H = h; DPR = dpr;
      const size = Math.round((ambient ? 0.22 : 0.16) * Math.min(w, h * 1.4)) * dpr;
      sprites = words.map((word) => {
        const m = document.createElement("canvas");
        const x = m.getContext("2d");
        x.font = `400 ${size}px ${font}`;
        const tw = Math.ceil(x.measureText(word).width) + size;
        m.width = tw; m.height = Math.ceil(size * 1.2);
        const g = m.getContext("2d");
        g.font = `400 ${size}px ${font}`;
        g.textBaseline = "middle";
        g.fillStyle = c.cream;
        g.fillText(word, size / 2, m.height / 2);
        return { img: m, w: tw, h: m.height };
      });
      total = sprites.reduce((a, s) => a + s.w, 0);
    }

    function draw(ctx, angleDeg, timeSec, intensity) {
      if (!sprites.length) return;
      const cw = W * DPR, ch = H * DPR;
      const a = ((angleDeg % 360) + 360) % 360;
      const R = cw * 0.42;
      const cy = ch * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.9 * (intensity == null ? 1 : intensity);
      // one band of words wrapped around a vertical drum
      let start = -(a / 360) * total;
      for (let pass = 0; pass < 2; pass++) {
        let x = start + pass * total;
        for (const s of sprites) {
          const theta = ((x + s.w / 2) / total) * Math.PI * 2; // position around the drum
          const depth = Math.cos(theta);                       // 1 front … -1 back
          const sx = cw / 2 + Math.sin(theta) * R;
          const scale = 0.55 + 0.45 * depth;
          ctx.globalAlpha = Math.max(0, (0.15 + 0.85 * ((depth + 1) / 2))) * 0.9 * (intensity == null ? 1 : intensity);
          ctx.drawImage(s.img, sx - (s.w * scale) / 2, cy - (s.h * scale) / 2, s.w * scale, s.h * scale);
          x += s.w;
        }
      }
      ctx.restore();
    }
    return { resize, draw };
  };
})();
