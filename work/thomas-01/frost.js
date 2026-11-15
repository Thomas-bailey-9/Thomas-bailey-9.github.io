// THOMAS / 01 — frost particles for the opening and the finale only.
//
// Three sparse depth layers of tiny, soft frost specks drift slowly behind the
// can and type. The opening layer fades out with scroll before the flavour and
// reading scenes, so scrolling back brings it in again exactly. Canvases are
// added by script, so without JavaScript nothing changes. Animation runs only
// while a canvas is on screen and the tab is visible; with reduced motion the
// specks are drawn once and never move.

(() => {
  const story = document.querySelector('.story');
  const stage = story && story.querySelector('.stage');
  const backdrop = stage && stage.querySelector('.backdrop');
  const closingLight = document.querySelector('.closing__light');
  if (!backdrop || !closingLight || !window.HTMLCanvasElement) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Depth layers: far = smallest, faintest, slowest. Density is specks per 100,000 px².
  const LAYERS = [
    { density: 5.0, r: [0.55, 0.85], alpha: [0.45, 0.65], fall: [5, 8],   sway: 4,  soft: 0.15 },
    { density: 2.2, r: [0.95, 1.4], alpha: [0.5, 0.65],  fall: [9, 13],  sway: 7,  soft: 0.45 },
    { density: 0.7, r: [1.7, 2.4], alpha: [0.32, 0.45],  fall: [14, 19], sway: 10, soft: 0.85 },
  ];
  const MAX_SPECKS = 110;
  const COLOUR = '136, 156, 176'; // cool silver, visible on glacial white without glare

  // Opening fade, in screens of story scroll: full until FADE[0], gone by FADE[1]
  // (before the reveal copy finishes and well before the flavour scene).
  const FADE = [0.2, 0.55];

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // One pre-rendered soft dot per layer, drawn scaled for each speck.
  function sprite(soft) {
    const s = 32, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, `rgba(${COLOUR}, 1)`);
    grad.addColorStop(Math.max(0.05, 1 - soft), `rgba(${COLOUR}, 0.9)`);
    grad.addColorStop(1, `rgba(${COLOUR}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return c;
  }
  const SPRITES = LAYERS.map((l) => sprite(l.soft));

  function makeField(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'frost-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const field = { canvas, ctx, specks: [], w: 0, h: 0, visible: false, opacity: 1 };

    field.resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      field.w = w; field.h = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const area = (w * h) / 100000;
      const total = LAYERS.reduce((n, l) => n + l.density * area, 0);
      const k = Math.min(1, MAX_SPECKS / total);
      field.specks = [];
      LAYERS.forEach((l, li) => {
        const n = Math.round(l.density * area * k);
        for (let i = 0; i < n; i++) {
          field.specks.push({
            li, x: rand(0, w), y: rand(0, h),
            r: rand(...l.r), a: rand(...l.alpha),
            v: rand(...l.fall), sway: l.sway * rand(0.6, 1),
            phase: rand(0, Math.PI * 2), freq: rand(0.08, 0.16),
          });
        }
      });
      field.draw(0, 0);
    };

    field.draw = (t, dt) => {
      ctx.clearRect(0, 0, field.w, field.h);
      for (const p of field.specks) {
        if (dt) {
          p.y += p.v * dt;
          if (p.y - p.r * 3 > field.h) { p.y = -p.r * 3; p.x = rand(0, field.w); }
        }
        const x = p.x + Math.sin(p.phase + t * p.freq * Math.PI * 2) * p.sway;
        const d = p.r * 3; // sprite diameter covers the soft falloff
        ctx.globalAlpha = p.a;
        ctx.drawImage(SPRITES[p.li], x - d / 2, p.y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
    };
    return field;
  }

  const opening = makeField(backdrop);
  const finale = makeField(closingLight);
  const fields = [opening, finale];

  // ---------- Visibility ----------

  function openingOpacity() {
    const unit = stage.offsetHeight || window.innerHeight;
    const s = -story.getBoundingClientRect().top / unit;
    return 1 - clamp01((s - FADE[0]) / (FADE[1] - FADE[0]));
  }
  function updateOpening() {
    const o = openingOpacity();
    opening.opacity = o;
    opening.canvas.style.opacity = o.toFixed(3);
    opening.visible = o > 0.001;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.target === closingLight) finale.visible = e.isIntersecting; });
    kick();
  });
  io.observe(closingLight);

  // ---------- Loop ----------

  let raf = 0, last = 0, start = 0;
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const t = (now - start) / 1000;
    let active = false;
    for (const f of fields) if (f.visible) { f.draw(t, dt); active = true; }
    if (active) raf = requestAnimationFrame(frame); else last = 0;
  }
  function kick() {
    if (raf || reduced.matches || document.hidden) return;
    if (!fields.some((f) => f.visible)) return;
    if (!start) start = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; last = 0;
  }

  // ---------- Wiring ----------

  function resizeAll() { fields.forEach((f) => f.resize()); }
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resizeAll(); kick(); }, 150);
  });
  window.addEventListener('scroll', () => {
    const was = opening.visible;
    updateOpening();
    if (!was && opening.visible) kick();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : kick()));
  reduced.addEventListener('change', () => { stop(); resizeAll(); kick(); });

  resizeAll();
  updateOpening();
  kick();
})();
