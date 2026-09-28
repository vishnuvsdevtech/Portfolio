/* =========================================================
   Vishnu Surendran — Portfolio interactions
   Vanilla JS, no dependencies. Every animation loop pauses
   when off-screen or when the tab is hidden.
   ========================================================= */
(() => {
  'use strict';

  const d = document, root = d.documentElement;
  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => Array.from(c.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeIO = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  /* ---------- Theme colors (read from CSS tokens) ---------- */
  const C = {};
  function readColors() {
    const cs = getComputedStyle(root);
    ['bg', 'bg-2', 'card', 'card-2', 'ink', 'ink-2', 'muted', 'accent'].forEach(k => { C[k] = cs.getPropertyValue('--' + k).trim(); });
  }
  function rgba(hex, a) {
    if (!hex || hex[0] !== '#') return hex;
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }
  readColors();

  /* ---------- Boot → intro ---------- */
  function boot(done) {
    const el = $('#boot');
    if (root.classList.contains('no-boot')) { done(); return; }
    const num = $('#bootNum'), log = $('#bootLog');
    const msgs = ['loading weights…', 'warming up camera…', 'calibrating detector…', 'ready.'];
    const start = performance.now(), dur = 1150;
    (function f(now) {
      const p = clamp((now - start) / dur, 0, 1);
      num.textContent = String(Math.round(easeOut(p) * 100)).padStart(2, '0');
      log.textContent = msgs[Math.min(3, Math.floor(p * 4))];
      if (p < 1) requestAnimationFrame(f);
      else setTimeout(() => {
        el.classList.add('done');
        try { sessionStorage.setItem('vs-booted', '1'); } catch (e) {}
        done();
      }, 160);
    })(start);
  }

  function intro() {
    root.classList.add('intro');
    initReveals();
    setTimeout(() => root.classList.add('settled'), reduce ? 0 : 1100);
    const card = $('#scanCard');
    if (reduce) { card.classList.add('locked'); return; }
    setTimeout(() => card.classList.add('scanning'), 500);
    setTimeout(() => card.classList.add('locked'), 1700);
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveals() {
    // stagger siblings that share a parent
    const groups = new Map();
    $$('.reveal').forEach(el => {
      const p = el.parentElement;
      const i = groups.get(p) || 0;
      groups.set(p, i + 1);
      if (!el.style.getPropertyValue('--d')) el.style.setProperty('--d', Math.min(i, 6) * 0.08 + 's');
    });
    // hero content waits for headline
    $$('.hero .reveal').forEach((el, i) => el.style.setProperty('--d', (0.45 + i * 0.12) + 's'));

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
        if (e.target.id === 'bigTitle') return;
        $$('[data-count]', e.target).forEach(countUp);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('.reveal, #bigTitle').forEach(el => {
      // anything already on screen reveals immediately; the rest waits for the observer
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight * 0.92 && r.bottom > 0) {
        el.classList.add('in');
        $$('[data-count]', el).forEach(countUp);
      } else io.observe(el);
    });
  }

  function countUp(el) {
    const target = +el.dataset.count, pad = +(el.dataset.pad || 0);
    const t0 = performance.now(), dur = 1300;
    (function f(now) {
      const p = clamp((now - t0) / dur, 0, 1);
      el.textContent = String(Math.round(easeOut(p) * target)).padStart(pad, '0');
      if (p < 1) requestAnimationFrame(f);
    })(reduce ? t0 + dur : t0);
  }

  /* ---------- Split the contact title into masked words ---------- */
  function splitTitle() {
    const el = $('#bigTitle');
    let i = 0;
    const out = [];
    el.childNodes.forEach(n => {
      if (n.nodeType === 3) {
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) out.push(' ');
          else out.push(`<span class="w"><span style="--i:${i++}">${part}</span></span>`);
        });
      } else {
        out.push(`<span class="w"><span style="--i:${i++}" class="${n.className}">${n.textContent}</span></span>`);
      }
    });
    el.innerHTML = out.join('');
  }

  /* ---------- Clock ---------- */
  function clock() {
    const el = $('#clock');
    const tick = () => {
      const t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
      el.textContent = 'KOCHI · ' + t + ' IST';
    };
    tick(); setInterval(tick, 15000);
  }

  /* ---------- Scroll: progress, header hide, pipeline ---------- */
  function scrollFx() {
    const bar = $('#progress'), top = $('#top'), pipe = $('#pipeline');
    const steps = $$('.step', pipe);
    let lastY = scrollY, ticking = false;
    const update = () => {
      ticking = false;
      const y = scrollY, max = root.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      if (y > 400 && y > lastY + 4) top.classList.add('hide');
      else if (y < lastY - 4 || y < 400) top.classList.remove('hide');
      lastY = y;
      const r = pipe.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) {
        const p = clamp((innerHeight * 0.8 - r.top) / (innerHeight * 0.55), 0, 1);
        pipe.style.setProperty('--p', p.toFixed(3));
        steps.forEach((s, i) => s.classList.toggle('lit', p >= i * 0.48 + 0.02));
      }
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------- Nav active pill ---------- */
  function nav() {
    const navEl = $('#nav'), pill = $('#navPill');
    const links = $$('.nav-link', navEl);
    const move = (a) => {
      links.forEach(l => l.classList.toggle('active', l === a));
      if (!a || !navEl.offsetParent) return;
      pill.style.width = a.offsetWidth + 'px';
      pill.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    const map = { hero: 'hero', work: 'work', process: 'work', now: 'now', contact: 'contact' };
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        if (e.isIntersecting) move(links.find(l => l.dataset.sec === map[e.target.id]));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(id => { const s = d.getElementById(id); if (s) io.observe(s); });
    const first = links[0];
    requestAnimationFrame(() => move(first));
    addEventListener('resize', () => move($('.nav-link.active', navEl)), { passive: true });
  }

  /* ---------- Hero flow field ---------- */
  const heroState = { fps: 60, visible: true };
  function flowField() {
    const cv = $('#flow'), ctx = cv.getContext('2d');
    const hero = $('#hero');
    let w = 0, h = 0, gap = 36, pts = [], raf = 0, running = false;
    let mx = -9999, my = -9999, px = -9999, py = -9999, lastMove = -1e9;
    const trackers = Array.from({ length: 9 }, (_, i) => ({ i, seed: i * 17.3 }));

    function resize() {
      const r = cv.getBoundingClientRect();
      w = r.width; h = r.height;
      cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      gap = w < 700 ? 30 : 36;
      pts = [];
      for (let y = gap / 2; y < h; y += gap)
        for (let x = gap / 2; x < w; x += gap) pts.push({ x, y, dx: 0, dy: 0, e: 0 });
      if (!running) draw(performance.now());
    }

    hero.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect();
      px = e.clientX - r.left; py = e.clientY - r.top; lastMove = performance.now();
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { lastMove = -1e9; }, { passive: true });

    let frames = 0, fpsT = performance.now();
    function draw(now) {
      const t = now * 0.001;
      // idle attractor drifts on a lissajous path when the pointer is away
      if (now - lastMove > 2200) {
        const tx = w * (0.62 + 0.25 * Math.sin(t * 0.35)), ty = h * (0.45 + 0.25 * Math.sin(t * 0.52 + 1));
        mx = mx < -1000 ? tx : lerp(mx, tx, 0.03); my = my < -1000 ? ty : lerp(my, ty, 0.03);
      } else { mx = lerp(mx, px, 0.18); my = lerp(my, py, 0.18); }

      ctx.clearRect(0, 0, w, h);
      const R = Math.min(240, w * 0.28), R2 = R * R, L = gap * 0.34;
      const base = rgba(C.ink, 0.13), hot = C.accent;
      ctx.lineWidth = 1;
      ctx.strokeStyle = base;
      ctx.beginPath();
      const hotPath = new Path2D();
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        const n = Math.sin(p.x * 0.0045 + t * 0.35) + Math.cos(p.y * 0.006 - t * 0.28) + Math.sin((p.x + p.y) * 0.002 + t * 0.2);
        let a = n * 1.1;
        const dx = p.x - mx, dy = p.y - my, dd = dx * dx + dy * dy;
        let e = 0, ox = 0, oy = 0;
        if (dd < R2) {
          const dist = Math.sqrt(dd) || 1;
          e = 1 - dist / R; e *= e;
          a = lerp(a, Math.atan2(dy, dx) + Math.PI / 2 + 0.4, e);  // swirl around the cursor
          ox = dx / dist * e * 14; oy = dy / dist * e * 14;
        }
        p.dx = lerp(p.dx, ox, 0.12); p.dy = lerp(p.dy, oy, 0.12); p.e = lerp(p.e, e, 0.12);
        const x = p.x + p.dx, y = p.y + p.dy;
        const len = L * (1 + p.e * 1.2);
        const cx = Math.cos(a) * len, cy = Math.sin(a) * len;
        if (p.e > 0.12) { hotPath.moveTo(x - cx * .5, y - cy * .5); hotPath.lineTo(x + cx * .5, y + cy * .5); }
        else { ctx.moveTo(x - cx * .5, y - cy * .5); ctx.lineTo(x + cx * .5, y + cy * .5); }
      }
      ctx.stroke();
      ctx.strokeStyle = hot; ctx.lineWidth = 1.2;
      ctx.stroke(hotPath);

      // "tracked feature points": small boxes hopping between grid points
      if (pts.length) {
        ctx.strokeStyle = rgba(C.accent, 0.8); ctx.lineWidth = 1;
        ctx.font = '500 9px "Geist Mono", monospace'; ctx.fillStyle = rgba(C.accent, 0.85);
        for (const tr of trackers) {
          const step = Math.floor(t * 0.5 + tr.seed);
          const p = pts[Math.floor(rnd(step * 3.1 + tr.seed) * pts.length)];
          const x = p.x + p.dx, y = p.y + p.dy, s = 5;
          ctx.strokeRect(x - s, y - s, s * 2, s * 2);
          if (tr.i < 4) ctx.fillText('f' + String((step * 7 + tr.i) % 999).padStart(3, '0'), x + 8, y - 6);
        }
      }

      frames++;
      if (now - fpsT > 500) { heroState.fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
    }

    function loop(now) { if (!running) return; draw(now); raf = requestAnimationFrame(loop); }
    function start() { if (running || reduce) return; running = true; raf = requestAnimationFrame(loop); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    new ResizeObserver(resize).observe(cv);
    new IntersectionObserver(([e]) => { heroState.visible = e.isIntersecting; e.isIntersecting && !d.hidden ? start() : stop(); }).observe(hero);
    d.addEventListener('visibilitychange', () => { d.hidden ? stop() : heroState.visible && start(); });
    return { redraw: () => { if (!running) draw(performance.now()); } };
  }

  /* ---------- Scan card: HUD + tilt ---------- */
  function scanCard() {
    const fps = $('#fpsVal'), lat = $('#latVal'), conf = $('#confVal');
    setInterval(() => {
      if (!heroState.visible || d.hidden) return;
      fps.textContent = String(clamp(heroState.fps, 1, 240)).padStart(2, '0');
      lat.textContent = String(9 + Math.floor(Math.random() * 6));
      conf.textContent = (0.991 + Math.random() * 0.007).toFixed(3);
    }, 700);

    if (!fine || reduce) return;
    const wrap = $('.hero-visual'), card = $('#scanCard');
    wrap.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`;
    }, { passive: true });
    wrap.addEventListener('pointerleave', () => { card.style.transform = ''; });
  }

  /* ---------- Detector cursor ---------- */
  function detectorCursor() {
    if (!fine || reduce) return;
    root.classList.add('has-cursor');
    const el = $('#detCursor'), dot = $('#detDot'), lab = $('#detLabel');
    let x = -100, y = -100, cx = -100, cy = -100, cw = 28, ch = 28, target = null, shown = false;
    const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
    const labelFor = (t) => {
      const kind = t.dataset.cursor || (t.tagName === 'A' ? 'link' : 'button');
      const name = kind === 'project' ? ($('h3', t)?.textContent.toLowerCase().split(' ')[0] || 'project') : kind === 'face' ? 'person' : kind;
      return `${name} · 0.${90 + hash(t.textContent || kind) % 10}`;
    };
    addEventListener('pointermove', e => {
      x = e.clientX; y = e.clientY;
      if (!shown) { shown = true; cx = x - 14; cy = y - 14; el.classList.add('on'); dot.classList.add('on'); }
    }, { passive: true });
    d.addEventListener('pointerleave', () => { shown = false; el.classList.remove('on'); dot.classList.remove('on'); });
    d.addEventListener('pointerover', e => {
      const t = e.target.closest('a, button, [data-cursor], input');
      const next = t && t.tagName !== 'INPUT' ? t : null;
      if (next === target) return;
      target = next;
      el.classList.toggle('snap', !!target);
      if (target) lab.textContent = labelFor(target);
    });
    (function loop() {
      let tx, ty, tw, th, k;
      if (target && target.isConnected) {
        const r = target.getBoundingClientRect(), pad = target.dataset.cursor === 'project' || target.dataset.cursor === 'face' ? 8 : 6;
        tx = r.left - pad; ty = r.top - pad; tw = r.width + pad * 2; th = r.height + pad * 2; k = 0.22;
      } else { tx = x - 14; ty = y - 14; tw = 28; th = 28; k = 0.3; }
      cx = lerp(cx, tx, k); cy = lerp(cy, ty, k); cw = lerp(cw, tw, k); ch = lerp(ch, th, k);
      el.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`;
      el.style.width = cw.toFixed(1) + 'px'; el.style.height = ch.toFixed(1) + 'px';
      dot.style.transform = `translate3d(${x}px,${y}px,0)`;
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- Magnetic buttons + card spotlight + contact glow ---------- */
  function pointerFx() {
    if (!fine || reduce) return;
    $$('.magnetic').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.28}px, ${dy * 0.38}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
    d.addEventListener('pointermove', e => {
      const card = e.target.closest && e.target.closest('.card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
    const contact = $('#contact'), glow = $('.contact-glow');
    contact.addEventListener('pointermove', e => {
      const r = contact.getBoundingClientRect();
      glow.style.setProperty('--gx', (e.clientX - r.left - r.width / 2) * 0.5 + 'px');
      glow.style.setProperty('--gy', (e.clientY - r.top - r.height / 2) * 0.5 + 'px');
    }, { passive: true });
  }

  /* ---------- Work filters ---------- */
  function filters() {
    const chips = $$('.chip'), cards = $$('.work'), count = $('#filterCount');
    chips.forEach(chip => chip.addEventListener('click', () => {
      const f = chip.dataset.filter;
      chips.forEach(c => c.classList.toggle('is-on', c === chip));
      let n = 0;
      cards.forEach(c => {
        const m = f === 'all' || c.dataset.cat.split(' ').includes(f);
        if (m) n++;
        c.classList.toggle('dim', !m);
        c.classList.toggle('hit', m && f !== 'all');
      });
      count.textContent = `${n} match${n === 1 ? '' : 'es'}`;
    }));
  }

  /* =========================================================
     Project sketches — one shared loop, only visible canvases draw
     ========================================================= */
  const MONO = '500 10px "Geist Mono", ui-monospace, monospace';
  const SANS = '400 12.5px "Geist", ui-sans-serif, system-ui, sans-serif';

  function corners(ctx, x, y, w, h, len, col, lw) {
    const l = Math.min(len, w / 2, h / 2);
    ctx.strokeStyle = col; ctx.lineWidth = lw || 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y);
    ctx.moveTo(x + w - l, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + l);
    ctx.moveTo(x + w, y + h - l); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - l, y + h);
    ctx.moveTo(x + l, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - l);
    ctx.stroke();
  }
  function tag(ctx, x, y, text, bg, fg) {
    ctx.font = MONO;
    const tw = ctx.measureText(text).width + 10;
    ctx.fillStyle = bg || C.accent; ctx.fillRect(x, y - 15, tw, 15);
    ctx.fillStyle = fg || '#0b0b0a'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(text, x + 5, y - 7);
  }
  function detBox(ctx, x, y, w, h, label, alpha) {
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.strokeStyle = rgba(C.accent, 0.35); ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, w, h);
    corners(ctx, x, y, w, h, 8, C.accent, 2);
    if (label) tag(ctx, x, y, label);
    ctx.globalAlpha = 1;
  }
  function hud(ctx, text, x, y, align, col) {
    ctx.font = MONO; ctx.fillStyle = col || C.muted; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y); ctx.textAlign = 'left';
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }

  const SKETCH = {
    /* 01 — objects crossing a scene, each with a jittering box */
    detect(ctx, w, h, t, s) {
      if (!s.objs) s.objs = [
        { k: 'person', by: .74, sp: 18, x0: 120, sc: .8 },
        { k: 'car', by: .86, sp: 46, x0: 0, sc: 1 },
        { k: 'person', by: .8, sp: -24, x0: 330, sc: 1 },
        { k: 'dog', by: .9, sp: -36, x0: 460, sc: 1 },
        { k: 'bike', by: .93, sp: 68, x0: 560, sc: 1 },
      ];
      const k0 = Math.min(1.25, h / 250);
      // perspective floor
      ctx.strokeStyle = rgba(C.ink, 0.07); ctx.lineWidth = 1; ctx.beginPath();
      const vx = w / 2, vy = h * 0.34;
      for (let i = -6; i <= 6; i++) { ctx.moveTo(vx, vy); ctx.lineTo(vx + i * w * 0.18, h); }
      for (let i = 1; i < 6; i++) { const yy = vy + (h - vy) * Math.pow(i / 6, 1.8); ctx.moveTo(0, yy); ctx.lineTo(w, yy); }
      ctx.stroke();

      const fill = rgba(C.ink, 0.16), line = rgba(C.ink, 0.5);
      s.objs.forEach((o, i) => {
        const k = k0 * o.sc, span = w + 180;
        const x = (((o.x0 + o.sp * t) % span) + span) % span - 90, by = h * o.by;
        let bw, bh;
        ctx.fillStyle = fill; ctx.strokeStyle = line; ctx.lineWidth = 1.2;
        if (o.k === 'car') {
          bw = 88 * k; bh = 36 * k;
          rr(ctx, x, by - 24 * k, bw, 17 * k, 5 * k); ctx.fill(); ctx.stroke();
          rr(ctx, x + 18 * k, by - 36 * k, 46 * k, 13 * k, 6 * k); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(x + 20 * k, by - 7 * k, 7 * k, 0, 7); ctx.moveTo(x + 76 * k, by - 7 * k); ctx.arc(x + 69 * k, by - 7 * k, 7 * k, 0, 7); ctx.fill(); ctx.stroke();
        } else if (o.k === 'person') {
          bw = 20 * k; bh = 54 * k;
          const sw = Math.sin(t * 7 + i) * 5 * k;
          ctx.beginPath(); ctx.arc(x + 10 * k, by - 47 * k, 6 * k, 0, 7); ctx.fill(); ctx.stroke();
          rr(ctx, x + 4 * k, by - 39 * k, 12 * k, 22 * k, 5 * k); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 8 * k, by - 18 * k); ctx.lineTo(x + 8 * k + sw, by); ctx.moveTo(x + 12 * k, by - 18 * k); ctx.lineTo(x + 12 * k - sw, by); ctx.stroke();
        } else if (o.k === 'bike') {
          bw = 46 * k; bh = 26 * k;
          ctx.beginPath(); ctx.arc(x + 10 * k, by - 10 * k, 10 * k, 0, 7); ctx.moveTo(x + 46 * k, by - 10 * k); ctx.arc(x + 36 * k, by - 10 * k, 10 * k, 0, 7); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 10 * k, by - 10 * k); ctx.lineTo(x + 20 * k, by - 24 * k); ctx.lineTo(x + 34 * k, by - 24 * k); ctx.lineTo(x + 36 * k, by - 10 * k); ctx.lineTo(x + 22 * k, by - 10 * k); ctx.closePath(); ctx.stroke();
        } else {
          bw = 34 * k; bh = 22 * k;
          const sw = Math.sin(t * 10 + i) * 3 * k;
          ctx.beginPath(); ctx.ellipse(x + 15 * k, by - 12 * k, 13 * k, 6 * k, 0, 0, 7); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(x + (o.sp < 0 ? 3 : 29) * k, by - 17 * k, 5 * k, 0, 7); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 8 * k, by - 7 * k); ctx.lineTo(x + 8 * k + sw, by); ctx.moveTo(x + 22 * k, by - 7 * k); ctx.lineTo(x + 22 * k - sw, by); ctx.stroke();
        }
        const j = Math.sin(t * 9 + i * 2) * 1.2;
        const conf = (0.84 + rnd(i) * 0.13 + Math.sin(t * 2.3 + i) * 0.012).toFixed(2);
        detBox(ctx, x - 5 + j, by - bh - 5 - j, bw + 10, bh + 8, `${o.k} ${conf}`);
      });
      hud(ctx, 'yolov8n · 640', 14, 22);
      hud(ctx, `${s.objs.length} objects`, w - 14, 22, 'right');
    },

    /* 02 — plate detected, then read character by character */
    plate(ctx, w, h, t, s) {
      const plates = ['KL 07 CD 4821', 'KL 41 A 7310', 'TN 09 BQ 2204'];
      const T = 4.6, ph = t % T, text = plates[Math.floor(t / T) % plates.length];
      const k = Math.min(w / 380, h / 260, 1.3), cx = w / 2;
      // car rear
      const cw = 250 * k, chh = 150 * k, top = h * 0.2;
      ctx.fillStyle = rgba(C.ink, 0.07); ctx.strokeStyle = rgba(C.ink, 0.4); ctx.lineWidth = 1.2;
      rr(ctx, cx - cw / 2 + 26 * k, top, cw - 52 * k, 50 * k, 14 * k); ctx.fill(); ctx.stroke();
      rr(ctx, cx - cw / 2, top + 44 * k, cw, chh - 44 * k, 16 * k); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba(C.accent, 0.55);
      rr(ctx, cx - cw / 2 + 12 * k, top + 60 * k, 40 * k, 14 * k, 4 * k); ctx.fill();
      rr(ctx, cx + cw / 2 - 52 * k, top + 60 * k, 40 * k, 14 * k, 4 * k); ctx.fill();
      // plate
      const pw = 136 * k, phh = 32 * k, px = cx - pw / 2, py = top + 88 * k;
      ctx.fillStyle = '#f2eee6'; rr(ctx, px, py, pw, phh, 4 * k); ctx.fill();
      ctx.strokeStyle = '#1a1815'; ctx.lineWidth = 1; rr(ctx, px + 2, py + 2, pw - 4, phh - 4, 3 * k); ctx.stroke();
      ctx.fillStyle = '#1a1815'; ctx.font = `600 ${Math.round(15 * k)}px "Geist Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, py + phh / 2 + 1); ctx.textAlign = 'left';

      // detection box shrinks onto the plate
      const p1 = easeOut(clamp(ph / 0.9, 0, 1));
      const bx = lerp(cx - cw / 2 - 10, px - 6, p1), by = lerp(top - 10, py - 6, p1);
      const bw = lerp(cw + 20, pw + 12, p1), bh = lerp(chh + 20, phh + 12, p1);
      detBox(ctx, bx, by, bw, bh, p1 > 0.98 ? 'plate 0.98' : 'vehicle 0.93');

      // OCR sweep
      const ocr = clamp((ph - 0.9) / 1.9, 0, 1);
      if (ocr > 0 && ocr < 1) {
        const sx = px + pw * ocr;
        ctx.fillStyle = rgba(C.accent, 0.18); ctx.fillRect(px, py, sx - px, phh);
        ctx.fillStyle = C.accent; ctx.fillRect(sx - 1, py - 4, 2, phh + 8);
      }
      const shown = text.slice(0, Math.floor(ocr * text.length + (ocr >= 1 ? 1 : 0)));
      const ry = h - 20;
      ctx.font = `500 ${Math.round(13 * Math.max(k, .85))}px "Geist Mono", monospace`; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = C.muted; ctx.fillText('OCR ›', 14, ry);
      const ox = 14 + ctx.measureText('OCR › ').width;
      ctx.fillStyle = C.ink; ctx.fillText(shown + (ocr < 1 && Math.floor(t * 4) % 2 ? '▍' : ''), ox, ry);
      if (ph > 3) tag(ctx, w - 14 - ctx.measureText('✓ gate_02 open').width - 4, ry + 3, '✓ gate_02 open');
      hud(ctx, 'cam_gate · 1080p', 14, 22);
    },

    /* 03 — question → retrieval → grounded answer */
    chat(ctx, w, h, t) {
      const T = 7.5, ph = t % T;
      const fade = ph > T - 0.6 ? 1 - (ph - (T - 0.6)) / 0.6 : 1;
      ctx.globalAlpha = fade;
      const docs = w > 300;
      const left = docs ? 70 : 14, right = w - 14;
      ctx.font = SANS;
      // docs column
      if (docs) {
        for (let i = 0; i < 3; i++) {
          const dy = h * 0.22 + i * 46, lit = ph > 1 + i * 0.35 && ph < 2.8;
          ctx.fillStyle = lit ? rgba(C.accent, 0.18) : rgba(C.ink, 0.05);
          ctx.strokeStyle = lit ? C.accent : rgba(C.ink, 0.2); ctx.lineWidth = 1;
          rr(ctx, 14, dy, 36, 40, 4); ctx.fill(); ctx.stroke();
          ctx.fillStyle = rgba(C.ink, lit ? 0.5 : 0.2);
          for (let l = 0; l < 4; l++) ctx.fillRect(20, dy + 8 + l * 7, l === 3 ? 14 : 24, 2);
          if (lit) {
            ctx.strokeStyle = rgba(C.accent, 0.55); ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(50, dy + 20); ctx.bezierCurveTo(62, dy + 20, 58, h * 0.56, left + 6, h * 0.56); ctx.stroke(); ctx.setLineDash([]);
          }
        }
        hud(ctx, 'kb', 14, h * 0.22 - 8);
      }
      const bubble = (text, y, mine, a) => {
        ctx.font = SANS;
        const tw = ctx.measureText(text).width, bw = Math.min(tw + 24, right - left), bh = 30;
        const x = mine ? right - bw : left;
        ctx.globalAlpha = fade * a;
        ctx.fillStyle = mine ? C.accent : rgba(C.ink, 0.08);
        rr(ctx, x, y + (1 - a) * 8, bw, bh, 14); ctx.fill();
        ctx.fillStyle = mine ? '#0b0b0a' : C.ink; ctx.textBaseline = 'middle';
        ctx.fillText(text, x + 12, y + bh / 2 + (1 - a) * 8);
        ctx.globalAlpha = fade;
      };
      if (ph > 0.3) bubble('Warranty on model X2?', h * 0.14, true, easeOut(clamp((ph - 0.3) / 0.4, 0, 1)));
      if (ph > 1 && ph < 2.8) {
        hud(ctx, 'retrieving · 3 chunks', left, h * 0.46);
        for (let i = 0; i < 3; i++) {
          const a = 0.3 + 0.7 * Math.max(0, Math.sin(t * 8 - i * 0.8));
          ctx.fillStyle = rgba(C.ink, a); ctx.beginPath(); ctx.arc(left + 12 + i * 10, h * 0.56, 3, 0, 7); ctx.fill();
        }
      }
      if (ph > 2.8) {
        const full = '24 months, per policy §3.2.';
        const n = Math.floor(clamp((ph - 2.8) / 1.1, 0, 1) * full.length);
        bubble(full.slice(0, Math.max(1, n)), h * 0.46, false, 1);
      }
      if (ph > 4.1) {
        const a = easeOut(clamp((ph - 4.1) / 0.4, 0, 1));
        ctx.globalAlpha = fade * a;
        tag(ctx, left, h * 0.46 + 52, 'src: policy.pdf · p3', rgba(C.ink, 0.1), C.muted);
        ctx.globalAlpha = fade;
      }
      if (ph > 4.8) bubble('Great, thanks!', h * 0.76, true, easeOut(clamp((ph - 4.8) / 0.4, 0, 1)));
      ctx.globalAlpha = 1;
    },

    /* 04 — rotating face mesh + embedding match */
    face(ctx, w, h, t, s) {
      if (!s.mesh) {
        s.mesh = [];
        for (let r = 1; r <= 6; r++) {
          const n = 6 + r * 4, rr0 = r / 6.2;
          for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r * 0.3; s.mesh.push([Math.cos(a) * rr0, Math.sin(a) * rr0]); }
        }
        s.feat = [[-.36, -.18], [.36, -.18], [0, .12], [-.26, .46], [.26, .46], [0, .5]];
      }
      const k = Math.min(h / 250, 1.3);
      const panel = w > 330;
      const cx = panel ? w * 0.3 : w / 2, cy = h * 0.52, rx = 58 * k, ry = 76 * k;
      const yaw = Math.sin(t * 0.8) * 0.45, cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
      const proj = (u, v) => {
        const z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
        return [cx + (u * cyaw + z * syaw) * rx, cy + v * ry, -u * syaw + z * cyaw];
      };
      // outline
      ctx.strokeStyle = rgba(C.ink, 0.35); ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2, [x, y] = proj(Math.cos(a) * 0.98, Math.sin(a) * 0.98);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      for (const [u, v] of s.mesh) {
        const [x, y, z] = proj(u, v);
        ctx.fillStyle = rgba(C.ink, clamp(0.15 + z * 0.55, 0.08, 0.7));
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      ctx.fillStyle = C.accent;
      for (const [u, v] of s.feat) { const [x, y] = proj(u, v); ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill(); }
      // scan line
      const sy = cy - ry + ((t * 0.6) % 1) * ry * 2;
      ctx.fillStyle = rgba(C.accent, 0.5); ctx.fillRect(cx - rx - 6, sy, rx * 2 + 12, 1);
      detBox(ctx, cx - rx - 10, cy - ry - 10, rx * 2 + 20, ry * 2 + 20, 'face 0.99');

      if (!panel) return;
      const x0 = cx + rx + 34 * k, pw = w - x0 - 16;
      hud(ctx, 'embedding · 128d', x0, h * 0.2);
      const bars = 20, bw = pw / bars, epoch = Math.floor(t / 3), bt = clamp((t % 3) / 0.6, 0, 1);
      for (let i = 0; i < bars; i++) {
        const a = rnd(i + epoch * 31), b = rnd(i + (epoch + 1) * 31);
        const v = lerp(a, b, easeOut(bt)) * 2 - 1;
        const bh = v * 22 * k;
        ctx.fillStyle = i % 5 === 0 ? C.accent : rgba(C.ink, 0.55);
        ctx.fillRect(x0 + i * bw, h * 0.34 - Math.max(0, bh), Math.max(1, bw - 2), Math.abs(bh) + 1);
      }
      const rows = [['ID_0042', 0.97], ['ID_0117', 0.41], ['ID_0009', 0.33]];
      const matchOn = (t % 3) > 0.9;
      rows.forEach(([id, sc], i) => {
        const y = h * 0.56 + i * 24;
        const hit = i === 0 && matchOn;
        ctx.fillStyle = hit ? rgba(C.accent, 0.16) : rgba(C.ink, 0.04);
        ctx.fillRect(x0, y - 14, pw, 20);
        hud(ctx, id, x0 + 8, y, 'left', hit ? C.accent : C.muted);
        hud(ctx, sc.toFixed(2), x0 + pw - 8, y, 'right', hit ? C.accent : C.muted);
      });
      if (matchOn) hud(ctx, '✓ access granted', x0, h * 0.56 + 76, 'left', C.ink);
    },

    /* 05 — frames resolve out of noise, audio timeline below */
    video(ctx, w, h, t) {
      const n = 5, gap = 8, fw = (w - 28 - gap * (n - 1)) / n, fh = Math.min(fw * 1.3, h * 0.46), y0 = h * 0.2;
      const G = 0.9, cycle = Math.floor(t / G), g = cycle % (n + 2), p = (t % G) / G;
      hud(ctx, `gen · frame ${String(Math.min(g + 1, n)).padStart(2, '0')}/05`, 14, 22);
      hud(ctx, 'identity 0.94', w - 14, 22, 'right');
      for (let i = 0; i < n; i++) {
        const x = 14 + i * (fw + gap);
        ctx.strokeStyle = rgba(C.ink, 0.18); ctx.lineWidth = 1;
        rr(ctx, x, y0, fw, fh, 6); ctx.stroke();
        const done = i < g, cur = i === g;
        if (!done && !cur) continue;
        const a = done ? 1 : easeOut(p);
        ctx.save(); rr(ctx, x, y0, fw, fh, 6); ctx.clip();
        ctx.fillStyle = rgba(C.accent, 0.08 * a); ctx.fillRect(x, y0, fw, fh);
        const sway = Math.sin(i * 0.9) * fw * 0.1, hx = x + fw / 2 + sway, hy = y0 + fh * 0.4;
        ctx.globalAlpha = a;
        ctx.fillStyle = rgba(C.ink, 0.35); ctx.beginPath(); ctx.ellipse(hx, y0 + fh * 0.95, fw * 0.32, fh * 0.3, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(hx, hy, fw * 0.17, 0, 7); ctx.fill();
        ctx.fillStyle = '#0b0b0a'; ctx.fillRect(hx - fw * 0.07, hy - 2, 2.5, 2.5); ctx.fillRect(hx + fw * 0.05, hy - 2, 2.5, 2.5);
        ctx.globalAlpha = 1;
        if (cur) {
          const dots = Math.floor(90 * (1 - p)), seed = Math.floor(t * 24);
          ctx.fillStyle = rgba(C.ink, 0.6);
          for (let j = 0; j < dots; j++) ctx.fillRect(x + rnd(j + seed) * fw, y0 + rnd(j * 2.7 + seed) * fh, 1.6, 1.6);
          corners(ctx, x - 3, y0 - 3, fw + 6, fh + 6, 7, C.accent, 1.6);
        }
        ctx.restore();
      }
      // timeline + waveform
      const ty = h * 0.84, tw = w - 28, head = ((t % 6) / 6) * tw;
      const bars = Math.floor(tw / 4);
      for (let i = 0; i < bars; i++) {
        const x = 14 + i * 4;
        const amp = (Math.abs(Math.sin(i * 0.31) * Math.sin(i * 0.07 + 1)) * 0.8 + rnd(i) * 0.2) * 16;
        ctx.fillStyle = x - 14 < head ? C.accent : rgba(C.ink, 0.22);
        ctx.fillRect(x, ty - amp, 2, amp * 2 + 1);
      }
      ctx.fillStyle = C.ink; ctx.fillRect(14 + head, ty - 22, 1.5, 44);
      hud(ctx, '♪ vocals · ml-IN', 14, h - 8);
    },

    /* 06 — IDs persist across two camera zones */
    people(ctx, w, h, t) {
      const mid = w / 2;
      ctx.strokeStyle = rgba(C.ink, 0.2); ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mid, 30); ctx.lineTo(mid, h - 14); ctx.stroke(); ctx.setLineDash([]);
      hud(ctx, 'CAM A', 14, 22); hud(ctx, 'CAM B', w - 14, 22, 'right');
      const pos = (i, tt) => {
        const sp = 0.22 + rnd(i) * 0.18, a = rnd(i * 3) * 6, b = rnd(i * 5) * 6;
        return [w * (0.5 + 0.42 * Math.sin(tt * sp + a)), h * (0.58 + 0.28 * Math.sin(tt * sp * 1.7 + b))];
      };
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = rgba(C.accent, 0.4); ctx.lineWidth = 1.5; ctx.beginPath();
        for (let j = 0; j < 22; j++) { const [x, y] = pos(i, t - j * 0.09); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
        const [x, y] = pos(i, t);
        ctx.fillStyle = rgba(C.ink, 0.5); ctx.beginPath(); ctx.arc(x, y - 18, 4, 0, 7); ctx.fill();
        rr(ctx, x - 5, y - 13, 10, 16, 4); ctx.fill();
        detBox(ctx, x - 10, y - 26, 20, 32, `ID ${i + 1}`);
        if (Math.abs(x - mid) < 14) hud(ctx, 'handoff ✓', x + 14, y + 4, 'left', C.accent);
      }
    },

    /* 07 — top-down floor plan with live heatmap */
    floor(ctx, w, h, t, s, dt) {
      const m = 16, W = w - m * 2, H = h - m * 2 - 14, oy = m + 14, cell = 12;
      const gx = Math.ceil(W / cell), gy = Math.ceil(H / cell);
      if (!s.heat || s.gx !== gx || s.gy !== gy) {
        s.heat = new Float32Array(gx * gy); s.gx = gx; s.gy = gy;
        s.ag = Array.from({ length: 6 }, (_, i) => ({ x: rnd(i) * W, y: rnd(i + 9) * H, tx: rnd(i + 3) * W, ty: rnd(i + 5) * H, sp: 26 + rnd(i + 7) * 20 }));
      }
      // heatmap
      const heat = s.heat;
      for (let i = 0; i < heat.length; i++) heat[i] *= 0.996;
      for (const a of s.ag) {
        const dx = a.tx - a.x, dy = a.ty - a.y, dist = Math.hypot(dx, dy);
        if (dist < 4) { a.tx = Math.random() * W; a.ty = Math.random() * H; }
        else { a.x += dx / dist * a.sp * dt; a.y += dy / dist * a.sp * dt; }
        const ci = clamp(Math.floor(a.x / cell), 0, gx - 1) + clamp(Math.floor(a.y / cell), 0, gy - 1) * gx;
        heat[ci] = Math.min(heat[ci] + dt * 1.6, 3);
      }
      for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
        const v = heat[i + j * gx];
        if (v > 0.04) { ctx.fillStyle = rgba(C.accent, Math.min(0.55, v * 0.22)); ctx.fillRect(m + i * cell + 1, oy + j * cell + 1, cell - 2, cell - 2); }
      }
      // walls
      ctx.strokeStyle = rgba(C.ink, 0.45); ctx.lineWidth = 1.5; ctx.strokeRect(m, oy, W, H);
      ctx.beginPath();
      ctx.moveTo(m + W * 0.38, oy); ctx.lineTo(m + W * 0.38, oy + H * 0.36);
      ctx.moveTo(m + W * 0.38, oy + H * 0.6); ctx.lineTo(m + W * 0.38, oy + H);
      ctx.moveTo(m + W * 0.38, oy + H * 0.5); ctx.lineTo(m + W * 0.6, oy + H * 0.5);
      ctx.moveTo(m + W * 0.76, oy + H * 0.5); ctx.lineTo(m + W, oy + H * 0.5);
      ctx.stroke();
      hud(ctx, 'LOBBY', m + 8, oy + 16); hud(ctx, 'LAB', m + W * 0.38 + 8, oy + 16); hud(ctx, 'DESKS', m + W * 0.38 + 8, oy + H * 0.5 + 16);
      for (const a of s.ag) {
        const x = m + a.x, y = oy + a.y;
        ctx.fillStyle = rgba(C.accent, 0.2); ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
        ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
      }
      hud(ctx, 'plan view · H·p', m, 22);
      hud(ctx, `${s.ag.length} people · live`, w - m, 22, 'right');
    },

    /* 08 — reticle searches a shelf, then locks onto the target */
    locate(ctx, w, h, t) {
      const cols = Math.max(4, Math.min(9, Math.floor((w - 28) / 48))), rows = 3;
      const top = 40, cw = (w - 28) / cols, ch = (h - top - 16) / rows, n = cols * rows;
      const T = 4.4, c = Math.floor(t / T), ph = t % T;
      const target = Math.floor(rnd(c * 7.3 + 1) * n);
      const cellC = (i) => [14 + (i % cols) * cw + cw / 2, top + Math.floor(i / cols) * ch + ch / 2];
      ctx.strokeStyle = rgba(C.ink, 0.12); ctx.lineWidth = 1;
      for (let r = 1; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(14, top + r * ch - 6); ctx.lineTo(w - 14, top + r * ch - 6); ctx.stroke(); }
      const sz = Math.min(cw, ch) * 0.28;
      for (let i = 0; i < n; i++) {
        const [x, y] = cellC(i), kind = i === target ? 3 : Math.floor(rnd(i + c * 13) * 4);
        const isT = i === target;
        ctx.fillStyle = isT ? C.accent : rgba(C.ink, 0.22); ctx.strokeStyle = isT ? C.accent : rgba(C.ink, 0.4);
        ctx.beginPath();
        if (kind === 0) ctx.arc(x, y, sz, 0, 7);
        else if (kind === 1) ctx.rect(x - sz, y - sz, sz * 2, sz * 2);
        else if (kind === 2) { ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y + sz); ctx.lineTo(x - sz, y + sz); ctx.closePath(); }
        else { ctx.rect(x - sz * 0.8, y - sz, sz * 1.6, sz * 2); }
        ctx.fill();
        if (kind === 3) { ctx.beginPath(); ctx.arc(x + sz * 0.8, y, sz * 0.5, -Math.PI / 2, Math.PI / 2); ctx.lineWidth = 2; ctx.stroke(); }
      }
      // reticle path: 3 random hops, then the target
      const hops = [Math.floor(rnd(c * 3.1) * n), Math.floor(rnd(c * 5.7) * n), Math.floor(rnd(c * 9.9) * n), target, target];
      const seg = Math.min(3, Math.floor(ph / 0.6)), sp = easeIO(clamp((ph - seg * 0.6) / 0.45, 0, 1));
      const from = seg === 0 ? cellC(Math.floor(rnd((c - 1) * 7.3 + 1) * n)) : cellC(hops[seg - 1]);
      const to = cellC(hops[seg]);
      const rx = lerp(from[0], to[0], sp), ry = lerp(from[1], to[1], sp);
      const locked = ph > 2.3;
      if (locked) {
        const [x, y] = cellC(target);
        const a = easeOut(clamp((ph - 2.3) / 0.3, 0, 1));
        detBox(ctx, x - cw / 2 + 4, y - ch / 2 + 4, cw - 8, ch - 12, 'mug 0.95', a);
      } else {
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(rx, ry, 14, 0, 7);
        ctx.moveTo(rx - 22, ry); ctx.lineTo(rx - 8, ry); ctx.moveTo(rx + 8, ry); ctx.lineTo(rx + 22, ry);
        ctx.moveTo(rx, ry - 22); ctx.lineTo(rx, ry - 8); ctx.moveTo(rx, ry + 8); ctx.lineTo(rx, ry + 22); ctx.stroke();
      }
      hud(ctx, 'query › "orange mug"', 14, 22, 'left', C.ink);
      hud(ctx, locked ? `found · ${(2.1 + rnd(c) * 0.4).toFixed(1)}s` : 'searching…', w - 14, 22, 'right', locked ? C.accent : C.muted);
    },

    /* 09 — seated skeleton drifting between good and bad posture */
    pose(ctx, w, h, t) {
      const k = Math.min(h / 250, w / 330, 1.3);
      const s = (Math.sin(t * 0.9) + 1) / 2, sl = easeIO(s);
      const hx = w * 0.4, hy = h * 0.66;
      const a = lerp(-3, 34, sl) * Math.PI / 180, L = 80 * k;
      const N = [hx + Math.sin(a) * L, hy - Math.cos(a) * L];
      const M = [(hx + N[0]) / 2 - Math.cos(a) * sl * 14 * k, (hy + N[1]) / 2 - Math.sin(a) * sl * 14 * k];
      const ha = a + sl * 0.5;
      const Hd = [N[0] + Math.sin(ha) * 17 * k, N[1] - Math.cos(ha) * 17 * k];
      const S = [lerp(hx, N[0], 0.88) + (M[0] - (hx + N[0]) / 2) * 0.3, lerp(hy, N[1], 0.88)];
      const K = [hx + 54 * k, hy + 2 * k], A = [K[0] + 4 * k, K[1] + 52 * k], F = [A[0] + 16 * k, A[1]];
      const deskY = hy - 18 * k;
      const W = [S[0] + 62 * k, deskY - 2], E = [lerp(S[0], W[0], 0.45) - 2 * k, lerp(S[1], W[1], 0.5) + 22 * k];
      // chair + desk
      ctx.strokeStyle = rgba(C.ink, 0.22); ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx - 30 * k, hy + 10 * k); ctx.lineTo(hx + 28 * k, hy + 10 * k);
      ctx.moveTo(hx - 30 * k, hy + 10 * k); ctx.lineTo(hx - 34 * k, hy - 62 * k);
      ctx.moveTo(hx - 2 * k, hy + 10 * k); ctx.lineTo(hx - 2 * k, A[1]);
      ctx.moveTo(W[0] - 16 * k, deskY); ctx.lineTo(w - 14, deskY);
      ctx.moveTo(w - 40 * k, deskY); ctx.lineTo(w - 40 * k, A[1]);
      ctx.moveTo(14, A[1] + 1); ctx.lineTo(w - 14, A[1] + 1);
      ctx.stroke();
      // bones
      const bad = sl > 0.55;
      ctx.strokeStyle = bad ? C.accent : C.ink; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(M[0], M[1], N[0], N[1]); ctx.stroke();
      ctx.strokeStyle = rgba(C.ink, 0.75); ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy); ctx.lineTo(K[0], K[1]); ctx.lineTo(A[0], A[1]); ctx.lineTo(F[0], F[1]);
      ctx.moveTo(S[0], S[1]); ctx.lineTo(E[0], E[1]); ctx.lineTo(W[0], W[1]);
      ctx.moveTo(N[0], N[1]); ctx.lineTo(Hd[0], Hd[1]);
      ctx.stroke(); ctx.lineCap = 'butt';
      ctx.strokeStyle = rgba(C.ink, 0.75); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(Hd[0], Hd[1], 11 * k, 0, 7); ctx.stroke();
      [[hx, hy], K, A, S, E, W, N, M].forEach(([x, y]) => {
        ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill();
      });
      // angle arc
      ctx.strokeStyle = rgba(C.accent, 0.8); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(hx, hy, 30 * k, -Math.PI / 2, -Math.PI / 2 + a, a < 0); ctx.stroke();
      ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba(C.ink, 0.3);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, hy - L * 0.9); ctx.stroke(); ctx.setLineDash([]);
      hud(ctx, `lean ${Math.abs(Math.round(a * 180 / Math.PI))}°`, hx - 36 * k, hy - 30 * k, 'right', C.ink);
      if (bad) tag(ctx, 14, 32, '⚠ ADJUST POSTURE');
      else tag(ctx, 14, 32, '✓ GOOD FORM', rgba(C.ink, 0.12), C.ink);
      // risk meter
      const mw = Math.min(110, w * 0.3), mx = w - 14 - mw;
      hud(ctx, 'risk', mx, 22);
      ctx.fillStyle = rgba(C.ink, 0.1); ctx.fillRect(mx, 28, mw, 4);
      ctx.fillStyle = bad ? C.accent : C.ink; ctx.fillRect(mx, 28, mw * sl, 4);
    },
  };

  function sketches() {
    const items = $$('canvas[data-viz]').map(cv => ({ cv, ctx: cv.getContext('2d'), type: cv.dataset.viz, w: 0, h: 0, vis: false, s: {}, bg: null, bgKey: '' }));
    let running = false, last = performance.now();

    const makeBg = (v) => {
      const off = d.createElement('canvas');
      off.width = v.cv.width; off.height = v.cv.height;
      const o = off.getContext('2d');
      o.setTransform(DPR, 0, 0, DPR, 0, 0);
      o.fillStyle = rgba(C.ink, 0.12);
      for (let y = 10; y < v.h; y += 16) for (let x = 10; x < v.w; x += 16) o.fillRect(x, y, 1, 1);
      v.bg = off; v.bgKey = C.ink + v.w + 'x' + v.h;
    };
    const paint = (v, t, dt) => {
      const { ctx } = v;
      if (!v.w) return;
      if (v.bgKey !== C.ink + v.w + 'x' + v.h) makeBg(v);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, v.cv.width, v.cv.height);
      ctx.drawImage(v.bg, 0, 0);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      SKETCH[v.type](ctx, v.w, v.h, t, v.s, dt);
    };

    const ro = new ResizeObserver(entries => entries.forEach(e => {
      const v = items.find(i => i.cv === e.target);
      const r = e.contentRect;
      v.w = r.width; v.h = r.height;
      v.cv.width = Math.round(r.width * DPR); v.cv.height = Math.round(r.height * DPR);
      if (!running) paint(v, reduce ? 3.2 : performance.now() / 1000, 0.016);
    }));
    items.forEach(v => ro.observe(v.cv));

    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      let any = false;
      const t = now / 1000;
      for (const v of items) if (v.vis) { any = true; paint(v, t, dt); }
      if (any && !d.hidden) requestAnimationFrame(loop); else running = false;
    }
    const start = () => { if (running || reduce) return; running = true; last = performance.now(); requestAnimationFrame(loop); };

    const io = new IntersectionObserver(es => {
      es.forEach(e => { items.find(i => i.cv === e.target).vis = e.isIntersecting; });
      start();
    }, { rootMargin: '60px 0px' });
    items.forEach(v => io.observe(v.cv));
    d.addEventListener('visibilitychange', () => { if (!d.hidden) start(); });

    return { repaint: () => items.forEach(v => { v.bgKey = ''; if (!running) paint(v, reduce ? 3.2 : performance.now() / 1000, 0.016); }) };
  }

  /* =========================================================
     Footer runner — a curly-haired, bespectacled pixel dino.
     Space / ↑ / tap to jump, ↓ to duck. No score, just vibes.
     ========================================================= */
  function dinoGame() {
    const box = $('#dino'), cv = $('#dinoCanvas'), ctx = cv.getContext('2d');
    const P = 2;                                    // one sprite pixel = 2 css px
    const GRAV = 2600, JUMP = 740, SHORT_HOP = 330; // px/s², px/s
    const touch = matchMedia('(hover:none)').matches;

    // '#' ink · 'g' accent (glasses) · 'e' eye white · 'c' cloud
    const pad = (g) => { const w = Math.max(...g.map(r => r.length)); return g.map(r => r.padEnd(w, '.')); };
    const eye = (g, s) => g.map((r, i) => i === 3 ? r.replace('e#', s) : r);
    const TOP = [
      '..........#.##.##.#...',
      '..........############',
      '..........#gggg#######',
      '..........gge#g#######',
      '..........#gggg#######',
      '..........############',
      '..........#######.....',
      '..........##########..',
      '#........#######......',
      '#.......#########.....',
      '##.....##########.....',
      '###...############....',
      '##############..##....',
      '.############...#.....',
      '..###########.........',
      '...#########..........',
      '....#######...........',
    ];
    const LEGS = {
      a: ['....###..##...', '....##....#...', '....#.....##..', '....##........'],
      b: ['....##..###...', '....#....##...', '....##...#....', '.........##...'],
      s: ['....##...##...', '....#.....#...', '....#.....#...', '....##....##..'],
    };
    const DUCK = [
      '..................#.##.##.',
      '#...............##########',
      '##.......########gggg#####',
      '################gge#g#####',
      '.################gggg#####',
      '..######################..',
      '...########.#######.......',
      '....#######..##...........',
    ];
    const DLEGS = {
      a: ['.....##..###..', '.....#.....#..', '.....##.......'],
      b: ['.....###..##..', '......#....#..', '...........##.'],
    };
    const GRIDS = {
      runA: pad([...TOP, ...LEGS.a]), runB: pad([...TOP, ...LEGS.b]),
      stand: pad([...TOP, ...LEGS.s]), blink: pad([...eye(TOP, '##'), ...LEGS.s]),
      dead: pad([...eye(TOP, 'ee'), ...LEGS.s]),
      duckA: pad([...DUCK, ...DLEGS.a]), duckB: pad([...DUCK, ...DLEGS.b]),
      cactus: pad([
        '...##...', '..####..', '..####..', '..####.#', '#.####.#', '#.####.#', '#.######', '#.####..',
        '######..', '..####..', '..####..', '..####..', '..####..', '..####..', '..####..', '..####..',
      ]),
      birdA: pad([
        '.....#..........', '.....##.........', '.....###........', '..#..####.......', '.##..#####......',
        '#############...', '..############..', '.......######...', '', '', '',
      ]),
      birdB: pad([
        '', '', '', '..#.............', '.##.............', '#############...', '..############..',
        '.....#######....', '.....#####......', '.....###........', '.....##.........',
      ]),
      cloud: pad(['.....cccc.....', '...cc....cc...', '.cc........cc.', 'c............c', 'cccccccccccccc']),
    };
    // hitboxes in sprite-pixel units: [x, y, w, h]
    const HB = {
      stand: [[11, 0, 11, 8], [1, 8, 16, 8], [4, 16, 7, 5]],
      duck: [[1, 1, 25, 7], [5, 8, 7, 3]],
      cactus: [[2, 0, 4, 16], [0, 3, 8, 5]],
      bird: [[0, 3, 13, 5]],
    };

    // sprites are rasterised once per theme and cached
    const cache = new Map();
    function sprite(name, p) {
      const key = name + p + C.ink + C.accent + C['bg-2'];
      let s = cache.get(key);
      if (s) return s;
      const g = GRIDS[name], cols = g[0].length, rows = g.length, u = p * DPR;
      s = d.createElement('canvas'); s.width = Math.ceil(cols * u); s.height = Math.ceil(rows * u);
      const x = s.getContext('2d');
      const col = { '#': C.ink, g: C.accent, e: C['bg-2'], c: rgba(C.ink, 0.22) };
      g.forEach((row, r) => {
        let c = 0;
        while (c < cols) {                          // merge horizontal runs into one rect
          const ch = row[c];
          if (ch === '.') { c++; continue; }
          let e = c; while (e < cols && row[e] === ch) e++;
          x.fillStyle = col[ch]; x.fillRect(Math.round(c * u), Math.round(r * u), Math.round((e - c) * u), Math.ceil(u));
          c = e;
        }
      });
      s.cols = cols; s.rows = rows;
      cache.set(key, s);
      return s;
    }
    const put = (name, p, x, y) => { const s = sprite(name, p); ctx.drawImage(s, Math.round(x), Math.round(y), s.cols * p, s.rows * p); return s; };

    let w = 0, h = 0, ground = 0, DX = 48;
    const pace = () => clamp(w / 720, 0.62, 1);
    const S = { state: 'idle', t: 0, dist: 0, speed: 0, y: 0, vy: 0, down: false, obs: [], clouds: [], pebbles: [], gap: 0, overAt: 0, hit: null };

    function scenery() {
      S.pebbles = Array.from({ length: Math.ceil(w / 22) }, () => ({ x: Math.random() * w, y: ground + 4 + Math.random() * 12, l: 1 + Math.random() * 3 }));
      S.clouds = Array.from({ length: Math.max(2, Math.round(w / 260)) }, (_, i) => ({ x: (i + Math.random()) * (w / Math.max(2, Math.round(w / 260))), y: 16 + Math.random() * (ground - 110) }));
    }
    function resize() {
      const r = cv.getBoundingClientRect();
      w = r.width; h = r.height;
      cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
      ground = h - 34; DX = w < 500 ? 24 : 56;
      scenery();
      draw(performance.now());
    }

    function reset() {
      Object.assign(S, { state: 'running', t: 0, dist: 0, speed: 380 * pace(), y: 0, vy: 0, obs: [], gap: w * 0.6, hit: null });
    }
    function jump() {
      if (S.y > 0) return;
      S.vy = JUMP; S.y = 0.01;
    }
    function press() {
      inView = true;
      if (S.state === 'idle') { reset(); jump(); }
      else if (S.state === 'over') { if (performance.now() - S.overAt > 450) reset(); }
      else jump();
      kick();
    }
    function release() { if (S.vy > SHORT_HOP) S.vy = SHORT_HOP; }

    function spawn() {
      const x = w + 20;
      if (S.t > 10 && Math.random() < 0.3) {
        // low → jump · mid → duck (or a well-timed jump) · high → run under. No ducking on touch.
        const lanes = touch ? [30, 74] : [30, 52, 74];
        const top = ground - lanes[Math.floor(Math.random() * lanes.length)];
        S.obs.push({ kind: 'bird', x, y: top, w: 32, h: 22, p: 2, n: 1, conf: (0.9 + Math.random() * 0.09).toFixed(2) });
      } else {
        const big = Math.random() < 0.4, p = big ? 3 : 2;
        const maxN = big ? (pace() < 0.8 ? 1 : 2) : S.speed < 460 ? 2 : 3;
        const n = 1 + Math.floor(Math.random() * maxN);
        const cw = 8 * p, ow = n * cw + (n - 1) * 2;
        S.obs.push({ kind: 'cactus', x, y: ground - 16 * p, w: ow, h: 16 * p, p, n, cw, conf: (0.9 + Math.random() * 0.09).toFixed(2) });
      }
      const last = S.obs[S.obs.length - 1];
      S.gap = last.w + S.speed * (0.62 + Math.random() * 0.7) + 120;
    }

    function dinoBoxes() {
      const ducking = S.down && S.y === 0;
      const name = ducking ? 'duckA' : 'stand', g = GRIDS[name];
      const top = ground - g.length * P - S.y;
      return (ducking ? HB.duck : HB.stand).map(([x, y, bw, bh]) => [DX + x * P, top + y * P, bw * P, bh * P]);
    }
    function obsBoxes(o) {
      if (o.kind === 'bird') return HB.bird.map(([x, y, bw, bh]) => [o.x + x * o.p, o.y + y * o.p, bw * o.p, bh * o.p]);
      const out = [];
      for (let i = 0; i < o.n; i++) {
        const ox = o.x + i * (o.cw + 2);
        HB.cactus.forEach(([x, y, bw, bh]) => out.push([ox + x * o.p, o.y + y * o.p, bw * o.p, bh * o.p]));
      }
      return out;
    }
    const overlap = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];

    function update(dt, now) {
      if (S.state !== 'running') {
        if (!reduce) S.clouds.forEach(c => { c.x -= 8 * dt; if (c.x < -40) c.x = w + 10; });
        return;
      }
      S.t += dt;
      S.speed = Math.min(900, 380 + S.t * 9) * pace();   // narrower screens run slower so there's time to react
      const dx = S.speed * dt;
      S.dist += dx;
      // physics
      if (S.y > 0) {
        S.vy -= (S.down ? GRAV * 2.8 : GRAV) * dt;
        S.y += S.vy * dt;
        if (S.y <= 0) { S.y = 0; S.vy = 0; }
      }
      // world scroll
      S.pebbles.forEach(p => { p.x -= dx; if (p.x < -4) { p.x += w + 8; p.y = ground + 4 + Math.random() * 12; } });
      S.clouds.forEach(c => { c.x -= dx * 0.12; if (c.x < -40) { c.x = w + 10 + Math.random() * 80; c.y = 16 + Math.random() * (ground - 110); } });
      S.obs.forEach(o => { o.x -= dx; });
      S.obs = S.obs.filter(o => o.x + o.w > -30);
      S.gap -= dx;
      if (S.gap <= 0) spawn();
      // collisions
      const me = dinoBoxes();
      for (const o of S.obs) {
        if (o.x > DX + 60 || o.x + o.w < DX - 10) continue;
        if (obsBoxes(o).some(b => me.some(m => overlap(m, b)))) { S.state = 'over'; S.overAt = now; S.hit = o; S.down = false; break; }
      }
    }

    function text(str, x, y, size, col, align, spacing) {
      ctx.font = `500 ${size}px "Geist Mono", ui-monospace, monospace`;
      ctx.fillStyle = col; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = spacing || '0px';
      ctx.fillText(str, x, y);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.textAlign = 'left';
    }

    function draw(now) {
      if (!w) return;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);

      S.clouds.forEach(c => put('cloud', 3, c.x, c.y));

      // ground
      ctx.fillStyle = rgba(C.ink, 0.55); ctx.fillRect(0, ground, w, 1);
      ctx.fillStyle = rgba(C.ink, 0.3);
      S.pebbles.forEach(p => ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.l * 2), 1));

      // obstacles, each with a detection box
      const flap = Math.floor(now / 160) % 2;
      S.obs.forEach(o => {
        if (o.kind === 'bird') put(flap ? 'birdA' : 'birdB', o.p, o.x, o.y);
        else for (let i = 0; i < o.n; i++) put('cactus', o.p, o.x + i * (o.cw + 2), o.y);
        if (o.x < w - 8) {
          const hit = S.hit === o;
          if (hit) { ctx.fillStyle = rgba(C.accent, 0.18); ctx.fillRect(o.x - 4, o.y - 4, o.w + 8, o.h + 8); }
          corners(ctx, o.x - 4, o.y - 4, o.w + 8, o.h + 8, 6, C.accent, 1.5);
          tag(ctx, o.x - 4, o.y - 4, hit ? 'collision' : `${o.kind} ${o.conf}`);
        }
      });

      // the dino
      let name = 'stand';
      if (S.state === 'over') name = 'dead';
      else if (S.state === 'idle') name = !reduce && now % 3200 < 140 ? 'blink' : 'stand';
      else if (S.y > 0) name = 'stand';
      else if (S.down) name = Math.floor(S.dist / 26) % 2 ? 'duckA' : 'duckB';
      else name = Math.floor(S.dist / 30) % 2 ? 'runA' : 'runB';
      const g = GRIDS[name], dh = g.length * P, dw = g[0].length * P, dy = ground - dh - S.y;
      put(name, P, DX, dy);
      corners(ctx, DX - 4, dy - 4, dw + 8, dh + 8, 6, rgba(C.ink, 0.35), 1.2);

      // overlays
      const cx = w / 2, cy = Math.max(40, ground / 2 - 6);
      if (S.state === 'idle') {
        text(touch ? 'TAP TO RUN' : 'PRESS SPACE OR CLICK TO RUN', cx, cy, 11, C.muted, 'center', '2px');
      } else if (S.state === 'over') {
        text('GAME OVER', cx, cy - 10, 15, C.ink, 'center', '6px');
        text(touch ? 'tap to retry' : 'space / click to retry', cx, cy + 14, 10.5, C.muted, 'center', '1px');
      }
    }

    // loop runs only while visible, and idles completely after a crash
    let raf = 0, looping = false, inView = false, last = 0;
    function frame(now) {
      const dt = Math.min(0.034, (now - last) / 1000); last = now;
      update(dt, now);
      draw(now);
      const keep = inView && !d.hidden && (S.state === 'running' || (S.state === 'idle' && !reduce));
      if (keep) raf = requestAnimationFrame(frame); else looping = false;
    }
    function kick() { if (looping) return; looping = true; last = performance.now(); raf = requestAnimationFrame(frame); }

    new ResizeObserver(resize).observe(cv);
    new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (inView) kick();
    }).observe(box);
    d.addEventListener('visibilitychange', () => { if (!d.hidden && inView) kick(); });

    // input — keys are only captured while the game is focused or mostly on screen
    const busy = () => {
      const a = d.activeElement;
      return !$('#cmdk').hidden || (a && a !== box && /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(a.tagName));
    };
    const onScreen = () => {
      const r = box.getBoundingClientRect();
      return Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) > r.height * 0.6;
    };
    const active = () => d.activeElement === box || (!busy() && onScreen());
    const isJump = (e) => e.code === 'Space' || e.key === 'ArrowUp';
    addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey || !active()) return;
      if (isJump(e)) { e.preventDefault(); if (!e.repeat) press(); }
      else if (e.key === 'ArrowDown' && S.state === 'running') { e.preventDefault(); S.down = true; }
    });
    addEventListener('keyup', e => {
      if (isJump(e)) release();
      else if (e.key === 'ArrowDown') S.down = false;
    });
    box.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      box.focus({ preventScroll: true });
      press();
    });
    box.addEventListener('pointerup', release);
    box.addEventListener('pointercancel', release);
    addEventListener('blur', () => { S.down = false; });

    return {
      redraw: () => { if (!looping) draw(performance.now()); },
      focus: () => {
        box.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        setTimeout(() => box.focus({ preventScroll: true }), reduce ? 0 : 600);
      },
    };
  }

  /* ---------- Theme ---------- */
  let flowApi = null, sketchApi = null, dinoApi = null;
  function setTheme(next) {
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('vs-theme', next); } catch (e) {}
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'light' ? '#f3efe6' : '#0b0b0a');
    readColors();
    flowApi && flowApi.redraw();
    sketchApi && sketchApi.repaint();
    dinoApi && dinoApi.redraw();
  }
  const toggleTheme = () => setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');

  /* ---------- Toast + copy ---------- */
  let toastT = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2000);
  }
  const EMAIL = 'vishnuvsdevtech@gmail.com';
  async function copyEmail() {
    try { await navigator.clipboard.writeText(EMAIL); }
    catch (e) {
      const ta = d.createElement('textarea'); ta.value = EMAIL; ta.style.position = 'fixed'; ta.style.opacity = '0';
      d.body.appendChild(ta); ta.select(); try { d.execCommand('copy'); } catch (err) {} ta.remove();
    }
    toast('✓ Email copied to clipboard');
  }

  /* ---------- Command palette ---------- */
  function commandPalette() {
    const wrap = $('#cmdk'), input = $('#cmdkInput'), list = $('#cmdkList');
    const go = (sel) => () => d.querySelector(sel).scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    const openURL = (u) => () => window.open(u, '_blank', 'noopener');
    const project = (title) => () => {
      const card = $$('.work').find(c => $('h3', c).textContent === title);
      card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      card.classList.add('hit'); setTimeout(() => card.classList.remove('hit'), 1800);
    };
    const cmds = [
      { label: 'Go to Home', hint: 'section', run: go('#hero') },
      { label: 'Go to Work', hint: 'section', run: go('#work') },
      { label: 'Go to Process', hint: 'section', run: go('#process') },
      { label: 'Go to Now', hint: 'section', run: go('#now') },
      { label: 'Go to Contact', hint: 'section', run: go('#contact') },
      { label: 'Copy email address', hint: 'action', run: copyEmail },
      { label: 'Write an email', hint: 'action', run: () => { location.href = 'mailto:' + EMAIL; } },
      { label: 'Toggle light / dark', hint: 'action', run: toggleTheme },
      { label: 'Play the dino game', hint: 'fun', run: () => dinoApi && dinoApi.focus() },
      { label: 'Open GitHub', hint: 'link', run: openURL('https://github.com/cosmodrop') },
      { label: 'Open LinkedIn', hint: 'link', run: openURL('https://www.linkedin.com/in/vishnu-surendran-375278170') },
      ...$$('.work h3').map(h => ({ label: h.textContent, hint: 'project', run: project(h.textContent) })),
    ];
    let shown = [], sel = 0, lastFocus = null;

    const render = () => {
      const q = input.value.trim().toLowerCase();
      shown = cmds.filter(c => !q || (c.label + ' ' + c.hint).toLowerCase().includes(q));
      sel = clamp(sel, 0, Math.max(0, shown.length - 1));
      list.innerHTML = shown.length
        ? shown.map((c, i) => `<li role="option" data-i="${i}" class="${i === sel ? 'sel' : ''}" aria-selected="${i === sel}">${c.label}<small>${c.hint}</small></li>`).join('')
        : '<li class="empty">No results</li>';
      const cur = list.children[sel]; cur && cur.scrollIntoView({ block: 'nearest' });
    };
    const open = () => {
      lastFocus = d.activeElement;
      wrap.hidden = false; input.value = ''; sel = 0; render();
      requestAnimationFrame(() => input.focus());
    };
    const close = () => { wrap.hidden = true; lastFocus && lastFocus.focus && lastFocus.focus(); };
    const exec = (i) => { const c = shown[i]; if (!c) return; close(); setTimeout(c.run, 60); };

    $('#cmdBtn').addEventListener('click', open);
    wrap.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) return close();
      const li = e.target.closest('li[data-i]'); if (li) exec(+li.dataset.i);
    });
    list.addEventListener('pointermove', e => {
      const li = e.target.closest('li[data-i]');
      if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; render(); }
    });
    input.addEventListener('input', () => { sel = 0; render(); });
    d.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); wrap.hidden ? open() : close(); return; }
      if (wrap.hidden) {
        if (e.key === '/' && !/INPUT|TEXTAREA/.test(d.activeElement.tagName)) { e.preventDefault(); open(); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); exec(sel); }
      else if (e.key === 'Tab') { e.preventDefault(); input.focus(); }
    });
    // platform-appropriate hint
    if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $('#cmdBtn span').textContent = 'Ctrl';
  }

  /* ---------- Footer wordmark fits its container exactly ---------- */
  function fitWordmark() {
    const el = $('.wordmark');
    const fit = () => {
      el.style.fontSize = '100px';
      const avail = el.parentElement.clientWidth - parseFloat(getComputedStyle(el.parentElement).paddingLeft) * 2;
      el.style.fontSize = Math.floor(100 * avail / el.scrollWidth * 0.995) + 'px';
    };
    fit();
    d.fonts && d.fonts.ready.then(fit);
    addEventListener('resize', fit, { passive: true });
  }

  /* ---------- Init ---------- */
  fitWordmark();
  splitTitle();
  clock();
  nav();
  scrollFx();
  flowApi = flowField();
  scanCard();
  detectorCursor();
  pointerFx();
  filters();
  sketchApi = sketches();
  dinoApi = dinoGame();
  commandPalette();
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#copyEmail').addEventListener('click', copyEmail);
  const bootNow = () => boot(intro);
  // start the boot once fonts are ready (or after a short cap) so the headline doesn't reflow
  if (d.fonts && d.fonts.ready && !root.classList.contains('no-boot')) {
    Promise.race([d.fonts.ready, new Promise(r => setTimeout(r, 900))]).then(bootNow);
  } else bootNow();
})();
