/**
 * Selected work: scroll-controlled project reveal (Animation 01).
 *
 * The contents list is pinned just below the header. At the start of the pin,
 * one project image (Copy Nothing — Miami) fills the list's frame; as the
 * visitor scrolls, the whole list pulls back, like a camera, until every tile
 * sits in its normal place. Then the pin releases and the page scrolls on.
 * Progress follows the scroll position directly, so scrolling up reverses it.
 *
 * It works on the existing tiles: no extra copies of images or links. The
 * header and its preview, the tile-to-project moves and the routes are
 * untouched. It runs only while Selected work is on screen, is skipped when
 * coming back from a project (the list is shown settled), and is off for
 * reduced motion.
 */
(() => {
  const TUNE = {
    hero: 'event', // data-tile of the image the reveal starts from
    gap: 12, // px between the header and the pinned list
    run: 0.8, // scroll distance of the reveal, as a share of the small viewport height
    spread: 0.07, // extra outward travel of the other tiles, as a share of the frame width
    copyFrom: 0.78, // progress at which titles, numbers and actions start to appear
    tallest: 4 / 3, // on narrow screens the opening image is at most this tall for its width, so it is not cut to a sliver
  };
  const PROJECTS = ['podcast', 'magazine', 'fashion', 'football', 'campaign', 'event', 'adverts', 'pitchside', 'orvan'];

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let list = null;
  let pin = null; // wraps the list so the pin releases before the chapter nav
  let items = [];
  let hero = null;
  let geo = null; // measured layout, at rest
  let armed = false;
  let lastOther = null; // the chapter shown before Selected work
  let frame = 0;
  let mode = 'off';
  let probe = null;
  let sheet = null; // pin offsets live here: the site clears inline styles on the section's children

  function writePin(top, run) {
    if (!sheet) {
      sheet = document.createElement('style');
      sheet.setAttribute('data-work-reveal', '');
      document.head.appendChild(sheet);
    }
    sheet.textContent = top == null ? '' : `.contents__pin[data-reveal]{--wr-top:${top}px;--wr-run:${run}px}`;
  }

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;
  const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };

  function smallViewportHeight() {
    if (!probe) {
      probe = document.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none';
      document.body.appendChild(probe);
    }
    return probe.getBoundingClientRect().height || window.innerHeight;
  }

  function setMode(next) {
    if (!list || mode === next) return;
    mode = next;
    if (next === 'off') { list.removeAttribute('data-reveal'); pin.removeAttribute('data-reveal'); }
    else { list.setAttribute('data-reveal', next); pin.setAttribute('data-reveal', next); }
  }

  function clearTransforms() {
    items.forEach((li) => { li.style.transform = ''; });
  }

  /**
   * The opening image: the preferred project, unless it would settle below the
   * fold (a phone on its side); then the most central project in the first view.
   */
  function pickHero(box, visible) {
    const mediaOf = (li) => (li.querySelector('.entry__media') || li).getBoundingClientRect();
    const fits = (li) => mediaOf(li).bottom - box.top <= visible;
    const preferred = list.querySelector(`[data-tile="${TUNE.hero}"]`)?.closest('li');
    let next = preferred && fits(preferred) ? preferred : null;
    if (!next) {
      const centre = box.left + box.width / 2;
      const distance = (li) => { const r = mediaOf(li); return Math.abs(r.left + r.width / 2 - centre) + (r.top - box.top); };
      next = items.filter(fits).sort((a, b) => distance(a) - distance(b))[0] || preferred || items[0];
    }
    if (next === hero && hero.hasAttribute('data-reveal-hero')) return;
    hero?.removeAttribute('data-reveal-hero');
    hero = next;
    hero.setAttribute('data-reveal-hero', '');
    const img = hero.querySelector('img');
    if (img) { img.setAttribute('sizes', '100vw'); img.setAttribute('fetchpriority', 'high'); }
  }

  /** Measures the list at rest: no pin, no transforms. */
  function measure() {
    const wasMode = mode;
    setMode('off');
    clearTransforms();
    writePin(null);

    const vh = smallViewportHeight();
    const header = document.querySelector('.header');
    const headerH = header ? header.getBoundingClientRect().height : 64;
    const top = Math.round(headerH + TUNE.gap);
    const run = Math.round(vh * TUNE.run);

    const box = list.getBoundingClientRect();
    const cs = getComputedStyle(list);
    const border = parseFloat(cs.borderTopWidth) || 0;
    const rects = items.map((li) => {
      const r = li.getBoundingClientRect();
      return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
    });
    pickHero(box, vh - top);
    const media = hero.querySelector('.entry__media') || hero;
    const m = media.getBoundingClientRect();
    const h = { x: m.left - box.left, y: m.top - box.top, w: m.width, h: m.height };

    // The frame: the list's own box, from below its rule to the bottom of the screen.
    const fTop = border;
    const fBottom = Math.min(box.height, vh - top);
    const fh = Math.max(1, fBottom - fTop);
    const th = Math.min(fh, box.width * TUNE.tallest);
    const f = { x: 0, y: fTop + (fh - th) / 2, w: box.width, h: th };
    const scale = Math.max(f.w / h.w, f.h / h.h);

    geo = {
      top, run, rects, h, f, scale,
      radius: parseFloat(getComputedStyle(media).borderTopLeftRadius) || 0,
      start: box.top + window.scrollY - top,
      heroCentre: { x: h.x + h.w / 2, y: h.y + h.h / 2 },
      frameCentre: { x: f.x + f.w / 2, y: f.y + f.h / 2 },
    };
    writePin(top, run);
    setMode(wasMode === 'off' ? 'run' : wasMode);
  }

  function progress() {
    return clamp((window.scrollY - geo.start) / geo.run);
  }

  function render() {
    frame = 0;
    if (!armed || !geo) return;
    const p = progress();
    if (p >= 1) {
      if (mode !== 'rest') { clearTransforms(); setMode('rest'); }
      return;
    }
    setMode('run');
    moving();
    const e = ease(p);
    const s = Math.pow(geo.scale, 1 - e);
    const { heroCentre: H, frameCentre: F } = geo;
    const cx = F.x + (H.x - F.x) * e;
    const cy = F.y + (H.y - F.y) * e;
    const spread = geo.f.w * TUNE.spread * (1 - e) * (1 - e);

    items.forEach((li, i) => {
      const r = geo.rects[i];
      let x = cx + (r.x - H.x) * s;
      let y = cy + (r.y - H.y) * s;
      if (li !== hero) {
        const dx = r.x + r.w / 2 - H.x;
        const dy = r.y + r.h / 2 - H.y;
        const d = Math.hypot(dx, dy) || 1;
        x += (dx / d) * spread;
        y += (dy / d) * spread;
      }
      li.style.transform = `translate3d(${(x - r.x).toFixed(2)}px, ${(y - r.y).toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
    });
    const copy = smooth(TUNE.copyFrom, 1, p).toFixed(2);
    if (copy !== geo.lastCopy) { geo.lastCopy = copy; list.style.setProperty('--wr-copy', copy); }
    // Corners stay the same visible size while the image is enlarged; whole-pixel steps keep repaints rare.
    const radius = Math.max(1, Math.round(geo.radius / s));
    if (radius !== geo.lastRadius) { geo.lastRadius = radius; list.style.setProperty('--wr-radius', `${radius}px`); }
  }

  // Tiles become their own layers only while the reveal moves; at rest they are redrawn sharp.
  let idle = 0;
  function moving() {
    if (!list.hasAttribute('data-reveal-moving')) list.setAttribute('data-reveal-moving', '');
    clearTimeout(idle);
    idle = setTimeout(() => list.removeAttribute('data-reveal-moving'), 200);
  }

  const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };

  function arm() {
    if (armed || reduced.matches || !list) return;
    armed = true;
    items.forEach((li) => li.querySelectorAll('img').forEach((img) => img.setAttribute('loading', 'eager')));
    mode = 'off';
    measure();
    render();
  }

  function disarm() {
    if (!list) return;
    armed = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    clearTransforms();
    setMode('off');
    writePin(null);
    hero?.removeAttribute('data-reveal-hero');
    geo = null;
  }

  /** Leaving mid-reveal: settle the tiles at once so any move starts from their real places. */
  function settle() {
    if (!armed || mode !== 'run') return;
    clearTransforms();
    setMode('rest');
  }

  let resizeTimer = 0;
  let lastWidth = window.innerWidth;
  let lastVh = 0;
  function onResize() {
    if (!armed) return;
    const vh = smallViewportHeight();
    // Safari's toolbar changes the large viewport only; the small one stays put.
    if (window.innerWidth === lastWidth && Math.abs(vh - lastVh) < 2) return;
    lastWidth = window.innerWidth;
    lastVh = vh;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (armed) { measure(); render(); } }, 120);
  }

  function workVisible(section) {
    return section && !section.hidden;
  }

  function init() {
    const section = document.querySelector('[data-chapter="work"]');
    list = section?.querySelector('.contents__list');
    if (!list) return;
    items = [...list.children].filter((el) => el.tagName === 'LI');
    if (!items.length) return;
    pin = document.createElement('div');
    pin.className = 'contents__pin';
    list.before(pin);
    pin.append(list);
    lastVh = smallViewportHeight();

    const chapters = [...document.querySelectorAll('[data-chapter]')];
    const shown = () => chapters.filter((el) => !el.hidden).map((el) => el.dataset.chapter);
    let wasVisible = workVisible(section);
    if (wasVisible) arm();

    new MutationObserver(() => {
      const visible = workVisible(section);
      const others = shown().filter((id) => id !== 'work');
      if (others.length) lastOther = others[others.length - 1];
      if (visible === wasVisible) return;
      wasVisible = visible;
      if (!visible) disarm();
      // Back from a project: show the collection settled, where the move lands.
      else if (!PROJECTS.includes(lastOther)) requestAnimationFrame(arm);
    }).observe(document.querySelector('.site__scenes') || document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    reduced.addEventListener?.('change', () => { if (reduced.matches) disarm(); else if (workVisible(section)) arm(); });
    new ResizeObserver(() => { if (armed) { measure(); render(); } }).observe(list);
    document.fonts?.ready.then(() => { if (armed) { measure(); render(); } });

    // Any navigation while the reveal is mid-way starts from the settled tiles.
    window.addEventListener('click', (event) => { if (event.target.closest?.('a[href], button')) settle(); }, true);
    window.addEventListener('keydown', (event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Enter') settle(); }, true);
    window.addEventListener('popstate', settle, true);
    // Keyboard focus on a project brings the settled collection into view.
    list.addEventListener('focusin', () => {
      if (armed && mode === 'run' && geo) window.scrollTo(0, Math.ceil(geo.start + geo.run));
    });
  }

  if (document.readyState === 'complete') requestAnimationFrame(init);
  else window.addEventListener('load', () => requestAnimationFrame(init), { once: true });
})();
