/* Homepage hero: the Ravolution R as a 3D object that turns as you scroll (faceless).
   Finish via data-finish on the canvas ("marble" | "red"); ?finish= overrides for previewing; ?sp=0..1 previews a scroll position. */
import * as THREE from '/js/vendor/three.module.min.js';

const cv = document.querySelector('.hero-3d');
if (cv) start();

function start() {
  const hero = cv.closest('.hero') || document.body;
  const q = new URLSearchParams(location.search);
  const finish = q.get('finish') || cv.dataset.finish || 'marble';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OUTLINE = [[0.4254,-0.4997],[0.1098,-0.5],[0.0863,-0.4941],[0.0715,-0.4853],[0.0464,-0.4602],[-0.1408,-0.2582],[-0.4416,-0.4971],[-0.4478,-0.4956],[-0.3747,-0.1122],[-0.2632,0.0854],[-0.2411,0.1155],[-0.2204,0.1311],[-0.1939,0.1399],[0.216,0.1402],[0.2455,0.1517],[0.2617,0.1679],[0.2706,0.1827],[0.2762,0.2092],[0.2735,0.2299],[0.2644,0.2505],[0.2426,0.272],[0.2219,0.2815],[-0.2558,0.2815],[-0.2735,0.2844],[-0.2853,0.2903],[-0.3015,0.3065],[-0.4487,0.4923],[-0.4505,0.5],[0.2455,0.4997],[0.2809,0.4909],[0.3192,0.4732],[0.3458,0.4552],[0.3797,0.4216],[0.4089,0.3803],[0.4269,0.3449],[0.4443,0.2918],[0.4505,0.2535],[0.4502,0.1974],[0.4387,0.1385],[0.4151,0.0824],[0.385,0.0352],[0.3605,0.0081],[0.331,-0.0161],[0.3015,-0.0335],[0.2632,-0.0488],[0.2101,-0.0577],[0.0111,-0.0591],[0.0347,-0.0768],[0.2765,-0.3334],[0.4148,-0.4808],[0.4269,-0.4956],[0.4254,-0.4997]];

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) { return; } // no WebGL: the hero simply stays as it was
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  // soft studio reflections: a small room of glowing panels baked into an environment map
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new THREE.Scene();
  const panel = (w, h, col, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry || 0; m.lookAt(0, 0, 0); room.add(m);
  };
  room.background = new THREE.Color(0x1a1714);
  panel(6, 3, 0xfff4e6, 0, 5, 3);
  panel(3, 6, 0xffffff, -6, 1, 2);
  panel(3, 6, 0xe8102e, 6, 0, -1);
  panel(8, 2, 0x8a7a6a, 0, -4, 4);
  scene.environment = pmrem.fromScene(room, 0.04).texture;

  // geometry: the traced logo outline, extruded with bevelled edges
  const shape = new THREE.Shape(OUTLINE.map(p => new THREE.Vector2(p[0], p[1])));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.022, bevelSegments: 6, curveSegments: 4 });
  geo.center();
  geo.computeVertexNormals();

  let mat;
  if (finish === 'red') {
    mat = new THREE.MeshPhysicalMaterial({ color: 0xd80d2a, metalness: 0.25, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: new THREE.Color(0xff6a6a) });
  } else {
    const tex = new THREE.TextureLoader().load('/assets/marble.jpg', () => { needsFrame = true; });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1.4, 1.4);
    mat = new THREE.MeshPhysicalMaterial({ map: tex, color: 0xffffff, metalness: 0.15, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 });
  }
  // ExtrudeGeometry UVs are in shape units; scale them so the texture covers the letter
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + 0.5, uv.getY(i) + 0.5);

  const R = new THREE.Mesh(geo, mat);
  const pivot = new THREE.Group(); pivot.add(R); scene.add(pivot);

  // lights on top of the environment: warm key, red rim, soft fill
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2); key.position.set(-3, 4, 6); scene.add(key);
  const rim = new THREE.PointLight(0xff1a3a, 30, 20); rim.position.set(3.5, 1, -2.5); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1a14, 0.6));
  // soft red glow behind the letter
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(232,16,46,0.55)'); r.addColorStop(1, 'rgba(232,16,46,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0.7 }));
  scene.add(glow);

  let W = 0, H = 0, mob = false, headTop = 0, needsFrame = true; // eslint-disable-line
  function size() {
    const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return;
    W = r.width; H = r.height; mob = W < 1000;
    const h1 = hero.querySelector('h1'), pin = hero.querySelector('.hero-pin') || hero;
    const tfNow = parseFloat(getComputedStyle(hero).getPropertyValue('--tf')) || 0;
    headTop = h1 ? h1.getBoundingClientRect().top - pin.getBoundingClientRect().top + tfNow * 40 : H * 0.4;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    needsFrame = true;
  }
  // soft contact shadow under the letter
  const shTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    const r = g.createRadialGradient(128, 32, 0, 128, 32, 128); r.addColorStop(0, 'rgba(40,20,15,0.45)'); r.addColorStop(1, 'rgba(40,20,15,0)');
    g.setTransform(1, 0, 0, 0.25, 0, 24); g.fillStyle = r; g.fillRect(0, -96, 256, 256); return new THREE.CanvasTexture(c); })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
  scene.add(shadow);

  // ---- reveal stage: dark studio, system grid floor, data streams, reflection (fades in as the R takes centre stage)
  const INK = new THREE.Color(0x0e1016);
  const stage = new THREE.Group(); scene.add(stage);
  const FLOOR_Y = -1.15;
  const gridMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uOp: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP,1.0); }',
    fragmentShader: [
      'uniform float uOp; uniform float uTime; varying vec3 vP;',
      'float line(float v, float w){ float d = abs(fract(v) - 0.5); return smoothstep(w, 0.0, abs(d - 0.5) ); }',
      'void main(){',
      '  vec2 g = vP.xz * 1.6;',
      '  vec2 f = abs(fract(g) - 0.5); vec2 dd = fwidth(g);',
      '  float l = max(1.0 - smoothstep(0.0, dd.x * 1.4, 0.5 - f.x), 1.0 - smoothstep(0.0, dd.y * 1.4, 0.5 - f.y));',
      '  float dist = length(vP.xz - vec2(0.0, 0.0));',
      '  float fade = smoothstep(14.0, 2.0, dist) * smoothstep(-16.0, -1.0, vP.z - 6.0);',
      '  float pulse = 0.5 + 0.5 * sin(dist * 2.2 - uTime * 2.4);',
      '  vec3 base = mix(vec3(0.42,0.40,0.46), vec3(0.91,0.06,0.18), smoothstep(3.2, 0.6, dist) * (0.55 + 0.45 * pulse));',
      '  gl_FragColor = vec4(base, l * fade * uOp * 0.55);',
      '}'].join('\n'),
    extensions: { derivatives: true }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), gridMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; stage.add(floor);

  // red data streams racing along the grid towards the letter
  const streamTex = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 128; const g = c.getContext('2d');
    const r = g.createLinearGradient(0, 0, 0, 128); r.addColorStop(0, 'rgba(255,40,70,0)'); r.addColorStop(0.85, 'rgba(255,40,70,0.9)'); r.addColorStop(1, 'rgba(255,220,225,1)');
    g.fillStyle = r; g.fillRect(0, 0, 8, 128); return new THREE.CanvasTexture(c); })();
  const streams = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 1.6), new THREE.MeshBasicMaterial({ map: streamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    m.rotation.x = -Math.PI / 2;
    const lane = (Math.round((Math.random() - 0.5) * 16) + 0.5) / 1.6;
    m.userData = { lane, z: -12 - Math.random() * 14, v: 3 + Math.random() * 4 };
    m.position.set(lane, FLOOR_Y + 0.005, m.userData.z); stage.add(m); streams.push(m);
  }
  // faint mirror image of the R on the floor
  const reflMat = mat.clone(); reflMat.transparent = true; reflMat.opacity = 0; reflMat.depthWrite = false;
  const refl = new THREE.Mesh(geo, reflMat); refl.scale.y = -1;
  const reflPivot = new THREE.Group(); reflPivot.add(refl); scene.add(reflPivot);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const span = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
  const ease = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic

  let sp = 0, spT = 0, t = 0, last = 0, running = false, visible = true;
  const fixed = q.get('sp');
  const track = !REDUCED;
  if (track) hero.classList.add('is-track');
  function readScroll() {
    if (fixed !== null) return;
    const top = hero.getBoundingClientRect().top + scrollY;
    const run = Math.max(1, hero.offsetHeight - innerHeight);
    spT = clamp((scrollY - top) / run, 0, 1);
    wake();
  }
  // run only while the hero is on screen; checked on every scroll so a hidden-at-load hero can't leave it switched off
  function wake() {
    if (REDUCED || document.hidden) return;
    const r = hero.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) go(); else stop();
  }
  if (fixed !== null) spT = sp = +fixed;

  function render(dt) {
    sp += (spT - sp) * Math.min(1, dt * 4); // soft, weighty follow
    const vh = 2 * Math.tan(camera.fov * Math.PI / 360) * camera.position.z, vw = vh * camera.aspect;
    const turn = ease(span(0.0, 0.97, sp));          // one full, eased revolution
    const move = ease(span(0.30, 0.94, sp));        // glide to centre stage
    const tf = ease(span(0.24, 0.62, sp));          // headline fades away
    const reveal = ease(span(0.40, 0.85, sp));      // lights down, the stage appears
    hero.style.setProperty('--tf', tf.toFixed(3));

    const px = vh / H; // world units per CSS pixel
    let s0, x0, y0;
    if (mob) { // fit the R into the free band between the menu bar and the headline
      const top = 92, gap = Math.max(110, headTop - top - 16);
      const sizePx = Math.min(gap * 0.82, W * 0.42);
      s0 = sizePx * px; x0 = vw * (W < 600 ? 0.17 : 0.24); y0 = (H / 2 - (top + gap / 2)) * px;
    } else { s0 = Math.min(vw * 0.23, vh * 0.52); x0 = vw * 0.31; y0 = -vh * 0.02; }
    const s = s0 * lerp(1, Math.max(1.32, Math.min(vw * 0.5, vh * 0.42) / s0), move);
    const x = lerp(x0, 0, move);
    const y = lerp(y0, 0.02 * vh, move);
    const idle = 1 - move;
    pivot.scale.setScalar(s);
    pivot.position.set(x, y + Math.sin(t * 0.8) * 0.03 * s, 0);
    pivot.rotation.y = -0.45 + turn * Math.PI * 2 + Math.sin(t * 0.45) * 0.10 * idle + 0.45 * move;
    pivot.rotation.x = 0.08 * idle + Math.sin(t * 0.33) * 0.04 * idle - 0.18 * Math.sin(turn * Math.PI);
    pivot.rotation.z = -0.04 * idle;

    glow.scale.setScalar(s * lerp(1, 1.25, move)); glow.position.set(x, y, -1.2);
    glow.material.opacity = lerp(0.6, 0.85, move);
    shadow.scale.set(s * (0.35 + 0.65 * Math.abs(Math.cos(pivot.rotation.y))), s, 1);
    shadow.position.set(x, y - s * 0.62, -0.4);
    shadow.material.opacity = 0.9 * (1 - reveal * 0.7);

    // reveal stage (floor sits just under the letter)
    const fy = y - s * 0.56; floor.position.y = fy;
    hero.style.setProperty('--dk', reveal.toFixed(3));
    gridMat.uniforms.uOp.value = reveal; gridMat.uniforms.uTime.value = t;
    stage.visible = reveal > 0.01;
    for (const m of streams) {
      m.userData.z += m.userData.v * dt;
      if (m.userData.z > 3) { m.userData.z = -16 - Math.random() * 10; }
      m.position.z = m.userData.z; m.position.y = fy + 0.005;
      m.material.opacity = reveal * clamp((m.userData.z + 16) / 6, 0, 1) * clamp((3 - m.userData.z) / 3, 0, 1);
    }
    reflPivot.visible = reveal > 0.01;
    reflPivot.position.set(x, 2 * fy - (y + Math.sin(t * 0.8) * 0.03 * s), 0);
    reflPivot.rotation.copy(pivot.rotation); reflPivot.rotation.x = -pivot.rotation.x;
    reflPivot.scale.setScalar(s);
    reflMat.opacity = reveal * 0.22;
    rim.intensity = 30 + reveal * 50;
    glow.material.opacity = lerp(0.6, 0.85, move) * (1 - reveal * 0.62);
    renderer.render(scene, camera);
  }
  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now; t += dt;
    render(dt); requestAnimationFrame(frame);
  }
  function go() { if (running) return; running = true; last = 0; requestAnimationFrame(frame); }
  function stop() { running = false; }

  size();
  new ResizeObserver(size).observe(cv);
  addEventListener('scroll', readScroll, { passive: true }); readScroll();
  addEventListener('resize', readScroll, { passive: true });
  cv.classList.add('is-on');
  if (REDUCED) { t = 0; sp = spT; render(1); new ResizeObserver(() => render(1)).observe(cv); return; }
  new IntersectionObserver(() => wake()).observe(hero);
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : wake(); });
  setTimeout(wake, 1500); setTimeout(wake, 3500); // after the preloader lifts
  go();
}
