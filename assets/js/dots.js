/* The portrait as a point cloud.
 *
 * Idle: the face is a sculpture of dots that turns a little with the pointer.
 * Click: every dot travels back to the pixel it was sampled from, the cloud
 * disappears, and the real photograph is underneath. Click again to re-form.
 *
 * Why canvas 2D and not three.js: the portfolio has no build step and no
 * framework, and one hero effect is not worth 600 kB. A few thousand fillRects
 * with manual perspective is the whole trick.
 *
 * Reverts cleanly: delete the script tag and the canvas never exists.
 */
(() => {
  const card = document.getElementById('scanCard');
  const img = card && card.querySelector('.scan-img');
  if (!card || !img) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) return;                    // reduced motion: the photograph is the hero

  const MAX_POINTS = MOBILE_POINTS();
  function MOBILE_POINTS() { return matchMedia('(max-width: 700px)').matches ? 15000 : 24000; }
  const MOBILE = matchMedia('(max-width: 700px)').matches;
  const STEP = 3;   // same grid everywhere: a bigger step on phones reads as faint noise
  const DPR = Math.min(2, window.devicePixelRatio || 1);

  const canvas = document.createElement('canvas');
  canvas.className = 'dot-cloud';
  canvas.setAttribute('aria-hidden', 'true');
  card.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: true });
  let pts = [], W = 0, H = 0, raf = 0;
  let rotX = 0, rotY = 0, tRotX = 0, tRotY = 0;   // pointer-driven, eased
  let morph = 0, morphTarget = 0;                 // 0 = sculpture, 1 = photograph
  let t0 = performance.now();
  let visible = true;

  /* ---------- sample the current theme's portrait ---------- */
  function currentPortrait() {
    const bg = getComputedStyle(img).backgroundImage;
    const m = /url\("?([^")]+)"?\)/.exec(bg);
    return m ? m[1] : null;
  }

  function build(url) {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const r = card.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      // sample the photograph at STEP, keeping only pixels that carry ink
      const off = document.createElement('canvas');
      const sw = Math.max(1, Math.round(W / STEP)), sh = Math.max(1, Math.round(H / STEP));
      off.width = sw; off.height = sh;
      const oc = off.getContext('2d', { willReadFrequently: true });
      oc.drawImage(image, 0, 0, sw, sh);
      const data = oc.getImageData(0, 0, sw, sh).data;

      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#63d9c4';
      const out = [];
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = (y * sw + x) * 4;
          const a = data[i + 3];
          if (a < 40) continue;
          const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
          out.push({
            x: x * STEP + STEP / 2,
            y: y * STEP + STEP / 2,
            // depth from brightness: dark hair sits back, the lit face forward
            z: (0.5 - lum) * 260,
            // one colour, alpha from the original brightness: the face is read by
            // density and light rather than by re-printing the photograph in dots
            r: accent,
            a: 0.14 + 0.86 * lum,
            big: lum > 0.55,
          });
        }
      }
      // keep the point budget: prefer the brighter (more defining) points
      if (out.length > MAX_POINTS) {
        out.sort((a, b) => (b.big ? 1 : 0) - (a.big ? 1 : 0));
        out.length = MAX_POINTS;
      }
      pts = out;
      t0 = performance.now();
      draw(performance.now());
    };
    if (url) image.src = url;
  }

  /* ---------- render ---------- */
  function draw(now) {
    if (!W) return;
    const t = (now - t0) / 1000;
    rotY += (tRotY - rotY) * 0.06;
    rotX += (tRotX - rotX) * 0.06;

    ctx.clearRect(0, 0, W, H);

    // hand the card over: dots while un-morphed, photograph once resolved. Painting
    // dots on top of a visible photo is just a dither, not a sculpture.
    img.style.transition = 'opacity .3s linear';
    img.style.opacity = String(smoothstep(0.5, 1, morph));

    const cx = W / 2, cy = H / 2;
    // deliberate idle sway on top of the pointer offset: without it the cloud is a
    // flat dither of a photograph and the click has nothing to resolve from
    const ry = (rotY * Math.PI) / 180 + Math.sin(t * 0.3) * 0.1;
    const rx = (rotX * Math.PI) / 180 + Math.cos(t * 0.31) * 0.05;
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    const cosX = Math.cos(rx), sinX = Math.sin(rx);
    const focal = 900;
    const m = morph * morph * (3 - 2 * morph);         // smoothstep

    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      const dx = p.x - cx, dy = p.y - cy;

      // rotate about Y then X, centred on the card
      let X = dx * cosY - p.z * sinY;
      let Z = dx * sinY + p.z * cosY;
      let Y2 = dy * cosX - Z * sinX;
      Z = dy * sinX + Z * cosX;

      const s = focal / (focal + Z);
      const px3 = cx + X * s, py3 = cy + Y2 * s;

      // morph from the sculpture position to the exact pixel
      const px = px3 + (p.x - px3) * m;
      const py = py3 + (p.y - py3) * m;

      const size = (p.big ? 2.1 : 1.5) * (0.8 + 0.4 * s) * (1 - 0.12 * m);
      ctx.fillStyle = p.r;
      ctx.globalAlpha = Math.min(1, p.a * (0.55 + 0.6 * s));
      ctx.fillRect(px, py, size, size);
    }
    ctx.globalAlpha = 1;

    // once fully morphed the photograph underneath is the real thing
    canvas.style.opacity = String(1 - smoothstep(0.92, 1, morph));

    if (visible) raf = requestAnimationFrame(draw);
  }

  const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  /* ---------- interaction ---------- */
  card.addEventListener('pointermove', (e) => {
    if (morph > 0.02) return;
    const r = card.getBoundingClientRect();
    tRotY = ((e.clientX - r.left) / r.width - 0.5) * 34;    // ±17°
    tRotX = -((e.clientY - r.top) / r.height - 0.5) * 22;   // ±11°
  }, { passive: true });

  card.addEventListener('pointerleave', () => { tRotY = 0; tRotX = 0; }, { passive: true });

  function toggle() {
    morphTarget = morphTarget > 0.5 ? 0 : 1;
    const start = performance.now(), from = morph, to = morphTarget;
    const span = 850;
    (function step(now) {
      const k = Math.min(1, (now - start) / span);
      morph = from + (to - from) * (k * k * (3 - 2 * k));
      if (k < 1) requestAnimationFrame(step);
      else if (to === 1) {
        // hand over to the photograph, and stop burning frames
        canvas.style.opacity = '0';
      }
    })(start);
  }

  let hinted = false;
  const hint = document.createElement('span');
  hint.className = 'dot-hint mono';
  hint.textContent = 'click to resolve';
  card.appendChild(hint);

  card.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;   // leave HUD links alone
    toggle();
    hinted = true;
    hint.classList.add('gone');
  });
  card.style.cursor = 'pointer';

  /* ---------- themes, visibility, resize ---------- */
  let lastUrl = currentPortrait();
  new MutationObserver(() => {
    const url = currentPortrait();
    if (url && url !== lastUrl) { lastUrl = url; build(url); }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent'] });

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) { cancelAnimationFrame(raf); t0 = performance.now(); raf = requestAnimationFrame(draw); }
  });

  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (lastUrl) build(lastUrl); }, 250);
  }, { passive: true });

  build(lastUrl);
  raf = requestAnimationFrame(draw);
  document.documentElement.dataset.dots = 'ready';
})();
