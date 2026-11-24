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

  const BUDGET = POINT_BUDGET();
  function POINT_BUDGET() { return matchMedia('(max-width: 700px)').matches ? 22000 : 42000; }
  const MOBILE = matchMedia('(max-width: 700px)').matches;
  let STEP = 2;      // set from the budget once the card size is known, so the grid
                     // is even everywhere: a fixed step plus culling is what made
                     // some areas dense and others bare
  const DPR = Math.min(2, window.devicePixelRatio || 1);

  const canvas = document.createElement('canvas');
  canvas.className = 'dot-cloud';
  canvas.setAttribute('aria-hidden', 'true');
  card.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: true });
  let pts = [], W = 0, H = 0, raf = 0;
  let rotX = 0, rotY = 0, tRotX = 0, tRotY = 0;   // pointer-driven, eased
  let morph = 0, morphTarget = 0;                 // 0 = sculpture, 1 = photograph
  let stride = 1, frameMs = 16, lastFrame = 0, samples = 0;   // adaptive detail
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

      // Sample the photograph exactly as CSS displays it: `background: center/cover`
      // crops rather than stretches. Drawing it into W x H directly squashed the
      // face to the card's aspect — that was the "distorted image" report.
      STEP = Math.max(1, Math.ceil(Math.sqrt((W * H) / BUDGET)));   // a floor of 2
      // silently capped the density no matter how the budget was raised
      const sw = Math.max(1, Math.round(W / STEP)), sh = Math.max(1, Math.round(H / STEP));
      const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
      const scale = Math.max(sw / iw, sh / ih);              // cover
      const dw = iw * scale, dh = ih * scale;
      const dx = (sw - dw) / 2, dy = (sh - dh) / 2;          // centre

      const off = document.createElement('canvas');
      off.width = sw; off.height = sh;
      const oc = off.getContext('2d', { willReadFrequently: true });
      oc.drawImage(image, dx, dy, dw, dh);
      const data = oc.getImageData(0, 0, sw, sh).data;

      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#63d9c4';

      const out = [];
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = (y * sw + x) * 4;
          const a = data[i + 3];
          if (a < 40) continue;
          const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
          // cheap gradient: how different this pixel is from its right and lower
          // neighbour, used to rank points when the budget has to cut some
          const jr = ((y * sw + Math.min(x + 1, sw - 1)) * 4) + 3;
          const jd = ((Math.min(y + 1, sh - 1) * sw + x) * 4) + 3;
          const lr = (data[jr - 3] * 0.299 + data[jr - 2] * 0.587 + data[jr - 1] * 0.114) / 255;
          const ld = (data[jd - 3] * 0.299 + data[jd - 2] * 0.587 + data[jd - 1] * 0.114) / 255;
          const edge = Math.abs(lum - lr) + Math.abs(lum - ld);
          // every pixel gets a point: the whole image is the sculpture, so shadow
          // and hair are as present as the lit cheek
          const keep = 1;
          out.push({
            // a little scatter breaks the visible grid without changing density
            x: x * STEP + STEP / 2 + (Math.random() - 0.5) * STEP * 0.55,
            y: y * STEP + STEP / 2 + (Math.random() - 0.5) * STEP * 0.55,
            // depth from brightness: dark hair sits back, the lit face forward
            z: (0.5 - lum) * 340,
            // one colour, alpha from the original brightness: the face is read by
            // density and light rather than by re-printing the photograph in dots
            r: accent,
            a: (0.22 + 0.78 * Math.pow(lum, 0.85)) * keep,
            edge,
            big: lum > 0.5,
          });
        }
      }
      // keep the point budget: prefer the brighter (more defining) points

      pts = out;
      document.documentElement.dataset.pts = String(pts.length);
      document.documentElement.dataset.step = String(STEP);
      document.documentElement.dataset.builds = String((+document.documentElement.dataset.builds || 0) + 1);
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
    const ry = (rotY * Math.PI) / 180 + Math.sin(t * 0.26) * 0.17;
    const rx = (rotX * Math.PI) / 180 + Math.cos(t * 0.31) * 0.05;
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    const cosX = Math.cos(rx), sinX = Math.sin(rx);
    const focal = 900;
    const m = morph * morph * (3 - 2 * morph);         // smoothstep

    for (let k = 0; k < pts.length; k += stride) {
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

      const size = (p.big ? 1.95 : 1.65) * (0.95 + 0.12 * s) * (1 - 0.12 * m);
      ctx.fillStyle = p.r;
      ctx.globalAlpha = Math.min(1, p.a * (0.85 + 0.2 * s));
      ctx.fillRect(px, py, size, size);
    }
    ctx.globalAlpha = 1;

    // once fully morphed the photograph underneath is the real thing
    canvas.style.opacity = String(1 - smoothstep(0.92, 1, morph));

    // keep the frame honest: on a slow machine, thin the cloud rather than stutter
    if (lastFrame) {
      frameMs = frameMs * 0.9 + (now - lastFrame) * 0.1;
      if (++samples > 45) {
        samples = 0;
        if (frameMs > 21 && stride < 3) stride++;
        else if (frameMs < 13 && stride > 1) stride--;
      }
    }
    lastFrame = now;

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
