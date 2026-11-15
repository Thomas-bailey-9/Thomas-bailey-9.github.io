// THOMAS / 01, "Winter, in a different shade." — scenes 1–7 (fictional product).
//
// Story (scenes 1–5): one can image travels through five keyframes as the
// visitor scrolls. Native scrolling only: no snapping, no wheel/touch/key
// interception. Scroll position maps directly to every pose, colour and type
// change, so scrolling back reverses the sequence exactly.

(() => {
  const root = document.documentElement;
  const story = document.querySelector('.story');
  const stage = story && story.querySelector('.stage');
  const rig = stage && stage.querySelector('.can-rig');
  if (!story || !stage || !rig) return;

  const slots = [2, 3, 4, 5].map((k) => stage.querySelector(`.slot--k${k}`));
  const regularImg = rig.querySelector('.can-img');
  const cue = story.querySelector('.cue');
  const selectScene = story.querySelector('.scene--select');
  const closing = document.querySelector('.closing');
  const headline = document.getElementById('headline');

  // Pixel height of the cropped regular can image (the rig is sized from it).
  const SOURCE_HEIGHT = 1522;
  // Never draw the can larger than this multiple of its own pixels.
  const MAX_UPSCALE = 1.5;

  // Opening framing (K1): the full can, as fractions of the stage.
  // bottom = gap below the can base. A small settle into K2 follows.
  const OPENING = {
    phone:   { x: 0.5,  height: 0.5,  bottom: 0.07, tilt: -2 },
    desktop: { x: 0.68, height: 0.76, bottom: 0.11, tilt: -3 },
  };
  // Tilt and glow at K2–K5.
  const KEYS = [
    { tilt: 0,  glow: 1 },     // K2 reveal
    { tilt: 3,  glow: 0.75 },  // K3 flavour
    { tilt: -2, glow: 0.55 },  // K4 taste
    { tilt: 0,  glow: 0.9 },   // K5 selection
  ];
  const OPENING_GLOW = 0.6;

  // Flavour still life: the can's plum body in the photograph and in the cut-out
  // (source pixels, measured), and how the photo is laid out (mirrors styles.css).
  const PHOTO = { w: 1536, h: 1024, body: { cx: 1135.5, cy: 530, h: 735 } };
  const CUTOUT = { w: 598, h: 1522, body: { cx: 296.5, cy: 771.5, h: 1368 } };
  const PHOTO_LAYOUT = {
    wide:  { x: 0.72, y: 0.62 },                  // background-size: cover
    phone: { x: 0.85, y: 1.0, heightFrac: 0.6 },  // background-size: auto 60%
  };

  // Timeline in screen heights of scroll. Each can move is one segment.
  // Pacing: short transitions (about half a screen), then a stable reading hold.
  const TOTAL = 6.4;
  const MOVES = [[0.25, 0.75], [1.5, 2.0], [3.55, 3.95], [5.6, 6.05]];
  const T = {
    cue: [0, 0.12],
    land: [0.3, 0.75],
    f1: [0.45, 0.7], amp: [0.52, 0.74], f2: [0.58, 0.8], rule: [0.66, 0.9],
    s2out: [1.5, 1.68],
    pist: [1.52, 1.9],
    w1: [1.62, 1.92],
    berry: [2.55, 2.95], recolour: [2.65, 2.9], w2: [2.62, 2.92],
    wout: [3.55, 3.72],
    eyebrow: [4.1, 4.3],
    n1: [4.3, 4.47], n2: [4.65, 4.82], n3: [5.0, 5.17], foot: [5.04, 5.2],
    tout: [5.3, 5.45],
    // Flavour still life: the photograph takes over from the moving can for the
    // flavour-direction hold, then hands back as the plum lifts away.
    photo: [3.95, 4.15], photoOut: [5.45, 5.6],
    lift: [5.45, 5.88],
    sel: [5.85, 6.15],
  };
  // Reduced motion: still compositions. Scroll ranges map to one representative point each.
  const STILLS = [[0.6, 0.1], [1.75, 1.3], [2.75, 2.3], [3.75, 3.3], [5.6, 5.3], [Infinity, 6.3]];

  const desktopQuery = window.matchMedia('(orientation: landscape), (min-width: 821px)');
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const range = (s, [a, b]) => clamp01((s - a) / (b - a));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const lerp = (a, b, t) => a + (b - a) * t;

  let geo = null;
  let ticking = false;

  story.style.setProperty('--story-screens', String(TOTAL));

  // ---------- Geometry ----------

  function measure() {
    const dpr = window.devicePixelRatio || 1;
    const cap = (SOURCE_HEIGHT * MAX_UPSCALE) / dpr;
    root.style.setProperty('--can-cap', `${cap.toFixed(1)}px`);

    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const st = stage.getBoundingClientRect();
    const aspect = regularImg.naturalWidth && regularImg.naturalHeight
      ? regularImg.naturalWidth / regularImg.naturalHeight
      : 598 / 1522;

    // K2–K5 from the CSS slots (stage-relative, untransformed).
    const keys = slots.map((el, i) => {
      const r = el.getBoundingClientRect();
      return { cx: r.left - st.left + r.width / 2, cy: r.top - st.top + r.height / 2, h: r.height, tilt: KEYS[i].tilt, glow: KEYS[i].glow };
    });

    // K4 lands exactly on the can in the flavour photograph, so the hand-over
    // between the cut-out and the photo is a match cut, not a double image.
    const pl = desktopQuery.matches ? PHOTO_LAYOUT.wide : PHOTO_LAYOUT.phone;
    const ps = pl.heightFrac ? (pl.heightFrac * H) / PHOTO.h : Math.max(W / PHOTO.w, H / PHOTO.h);
    const pox = (W - PHOTO.w * ps) * pl.x;
    const poy = (H - PHOTO.h * ps) * pl.y;
    const k = (PHOTO.body.h * ps) / CUTOUT.body.h; // screen px per cut-out px
    keys[2] = {
      cx: pox + PHOTO.body.cx * ps - (CUTOUT.body.cx - CUTOUT.w / 2) * k,
      cy: poy + PHOTO.body.cy * ps - (CUTOUT.body.cy - CUTOUT.h / 2) * k,
      h: Math.min(CUTOUT.h * k, cap), tilt: 0, glow: 0,
    };

    // K1: framed opening detail, kept clear of the scroll cue.
    const o = desktopQuery.matches ? OPENING.desktop : OPENING.phone;
    const openH = Math.min(o.height * H, cap);
    const cueRight = cue ? cue.getBoundingClientRect().right - st.left : 0;
    const openW = openH * aspect;
    const k1 = {
      cx: Math.max(o.x * W, cueRight + 16 + openW / 2),
      cy: H - o.bottom * H - openH / 2,
      h: openH, tilt: o.tilt, glow: OPENING_GLOW,
    };

    // Lay the image out at its largest keyframe size; only ever scale down.
    const all = [k1, ...keys];
    const layoutH = Math.max(...all.map((k) => k.h));
    const layoutW = layoutH * aspect;
    rig.style.width = `${layoutW}px`;
    rig.style.height = `${layoutH}px`;

    geo = { H, layoutW, layoutH, keys: all.map((k) => ({ ...k, scale: k.h / layoutH })) };
  }

  // ---------- Progress ----------

  function screens() {
    const unit = stage.offsetHeight || window.innerHeight;
    const s = -story.getBoundingClientRect().top / unit;
    return Math.min(TOTAL, Math.max(0, s));
  }

  function poseAt(s) {
    const k = geo.keys;
    // Find the segment we are in (or the keyframe we are holding at).
    let i = 0;
    while (i < MOVES.length && s >= MOVES[i][1]) i += 1;
    if (i >= MOVES.length) return { ...k[k.length - 1] };
    const t = easeInOut(range(s, MOVES[i]));
    const a = k[i];
    const b = k[i + 1];
    return {
      cx: lerp(a.cx, b.cx, t),
      cy: lerp(a.cy, b.cy, t),
      scale: a.scale * Math.pow(b.scale / a.scale, t), // geometric: an even pull-back
      tilt: lerp(a.tilt, b.tilt, t),
      glow: lerp(a.glow, b.glow, t),
    };
  }

  function render() {
    ticking = false;
    if (!geo) return;

    let s = screens();
    const reduced = reducedQuery.matches;
    if (reduced) s = STILLS.find(([limit]) => s < limit)[1];

    const p = poseAt(s);
    rig.style.transform =
      `translate(${(p.cx - geo.layoutW / 2).toFixed(2)}px, ${(p.cy - geo.layoutH / 2).toFixed(2)}px) ` +
      `rotate(${p.tilt.toFixed(3)}deg) scale(${p.scale.toFixed(4)})`;

    const set = (name, v) => story.style.setProperty(name, v.toFixed(4));
    set('--glow', p.glow);
    set('--cue', 1 - range(s, T.cue));
    set('--land', easeOut(range(s, T.land)));
    set('--f1', easeOut(range(s, T.f1)));
    set('--amp', easeOut(range(s, T.amp)));
    set('--f2', easeOut(range(s, T.f2)));
    set('--rule', easeInOut(range(s, T.rule)));
    set('--s2out', easeInOut(range(s, T.s2out)));
    set('--lilac', easeInOut(range(s, T.pist)));
    set('--w1', easeOut(range(s, T.w1)));
    set('--plum-in', easeInOut(range(s, T.berry)));
    set('--recolour', range(s, T.recolour));
    set('--w2', easeOut(range(s, T.w2)));
    set('--wout', easeInOut(range(s, T.wout)));
    set('--eyebrow', easeOut(range(s, T.eyebrow)));
    set('--n1', easeOut(range(s, T.n1)));
    set('--n2', easeOut(range(s, T.n2)));
    set('--n3', easeOut(range(s, T.n3)));
    set('--foot', easeOut(range(s, T.foot)));
    set('--tout', easeInOut(range(s, T.tout)));
    const photo = easeInOut(range(s, T.photo)) * (1 - easeInOut(range(s, T.photoOut)));
    set('--photo', photo);
    // Never two cans at once: the cut-out can hides while the photograph shows.
    rig.style.opacity = (1 - photo).toFixed(4);
    set('--lift', easeInOut(range(s, T.lift)));
    const sel = easeOut(range(s, T.sel));
    set('--sel', sel);
    if (selectScene) selectScene.classList.toggle('is-active', sel > 0.5);

    // Closing: the can rises into place as the section enters (reversible).
    if (closing) {
      const r = closing.getBoundingClientRect();
      // Starts once the section is a quarter in view; fully landed just before it reaches the top.
      const q = reduced ? (r.top < window.innerHeight * 0.6 ? 1 : 0) : clamp01((window.innerHeight * 0.75 - r.top) / (window.innerHeight * 0.65));
      closing.style.setProperty('--rise', easeOut(q).toFixed(4));
    }
  }

  function requestRender() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(render);
    }
  }

  function refresh() {
    measure();
    render();
  }

  // ---------- Coming soon (THOMAS / 02): reveal once when it scrolls into view ----------

  const next = document.querySelector('.next');
  if (next) {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { next.classList.add('is-in'); io.disconnect(); }
      }, { threshold: 0.3 });
      io.observe(next);
    } else {
      next.classList.add('is-in');
    }
  }

  // ---------- Replay ----------

  document.querySelectorAll('.replay').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reducedQuery.matches ? 'auto' : 'smooth' });
      if (headline) headline.focus({ preventScroll: true });
    });
  });

  // ---------- Wiring ----------

  window.addEventListener('scroll', requestRender, { passive: true });
  window.addEventListener('resize', () => window.requestAnimationFrame(refresh));
  desktopQuery.addEventListener('change', refresh);
  reducedQuery.addEventListener('change', refresh);
  if (!regularImg.complete) regularImg.addEventListener('load', refresh, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);

  refresh();
})();
