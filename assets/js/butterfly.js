/* Solarpunk butterfly — a living layer over the portfolio.
 *
 * Design constraints, in order:
 *   1. It must never interfere. pointer-events:none, and it draws behind nav.
 *   2. It must cost nothing when unwatched: rAF pauses on visibilitychange.
 *   3. It must respect prefers-reduced-motion — one static draw, no loop.
 *   4. It must not look like a particle demo. One creature, few sparks.
 */
(() => {
  const d = document;
  if (d.getElementById('bfly-canvas')) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = d.createElement('canvas');
  canvas.id = 'bfly-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '6',
  });
  d.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.floor(W * dpr);   // resizing the bitmap clears it
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // under reduced motion nothing repaints, so a resize would erase the
    // butterfly entirely (phone rotation, browser chrome collapsing)
    if (reduce.matches) drawStatic();
  }
  resize();
  addEventListener('resize', resize, { passive: true });

  const isLight = () => d.getAttribute('data-theme') === 'light';

  /* ------------------------------------------------------------- creature */
  const B = {
    x: W * 0.62, y: H * 0.42,
    vx: 0, vy: 0,
    heading: -0.4,
    wander: Math.random() * 1000,
    flap: 0,
    rest: 0,          // >0 = resting, flap slowed
    target: null,     // click destination
    energy: 1,
  };

  const petals = [];  // pollen sparks, bounded
  const MAX_PETALS = 26;

  const pointer = { x: -999, y: -999, active: false };

  addEventListener('pointermove', (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
  }, { passive: true });
  addEventListener('pointerleave', () => { pointer.active = false; }, { passive: true });

  addEventListener('pointerdown', (e) => {
    // dart toward the click, and shed pollen there
    B.target = { x: e.clientX, y: e.clientY, t: 0 };
    B.rest = 0;
    for (let i = 0; i < 14; i++) spawnPetal(e.clientX, e.clientY, 1.6);
  }, { passive: true });

  function spawnPetal(x, y, power) {
    if (petals.length >= MAX_PETALS) petals.shift();
    const a = Math.random() * Math.PI * 2;
    const s = (0.4 + Math.random() * 1.1) * power;
    petals.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.25,
      life: 1, size: 0.9 + Math.random() * 1.5,
    });
  }

  /* ------------------------------------------------------------- steering */
  function step(dt) {
    B.wander += dt * 0.6;
    // gentle wander: heading drifts on two out-of-phase sines -> no fixed path
    const drift = Math.sin(B.wander * 0.7) * 0.55 + Math.sin(B.wander * 1.9 + 2) * 0.22;
    B.heading += drift * dt;

    let ax = Math.cos(B.heading) * 14;
    let ay = Math.sin(B.heading) * 14;

    // keep it on screen with a soft spring, stronger near the edges
    const m = 90;
    if (B.x < m) ax += (m - B.x) * 1.1;
    if (B.x > W - m) ax -= (B.x - (W - m)) * 1.1;
    if (B.y < m) ay += (m - B.y) * 1.1;
    if (B.y > H - m) ay -= (B.y - (H - m)) * 1.1;

    // cursor: shy. Repelled inside 150px, gently.
    if (pointer.active) {
      const dx = B.x - pointer.x, dy = B.y - pointer.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 150) {
        const push = (1 - dist / 150) * 190;
        ax += (dx / dist) * push;
        ay += (dy / dist) * push;
      }
    }

    // click target: strong pull, decays
    if (B.target) {
      const dx = B.target.x - B.x, dy = B.target.y - B.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 26 || B.target.t > 3) {
        for (let i = 0; i < 8; i++) spawnPetal(B.x, B.y, 1.1);
        B.target = null;
        B.rest = 1.2;
      } else {
        ax += (dx / dist) * 260;
        ay += (dy / dist) * 260;
        B.target.t += dt;
      }
    }

    // resting: settle, slow the wings
    if (B.rest > 0) {
      B.rest -= dt;
      ax *= 0.25; ay *= 0.25;
    }

    B.vx = (B.vx + ax * dt) * 0.94;
    B.vy = (B.vy + ay * dt) * 0.94;
    B.x += B.vx * dt;
    B.y += B.vy * dt;

    const speed = Math.hypot(B.vx, B.vy);
    if (speed > 4) B.heading = Math.atan2(B.vy, B.vx) * 0.25 + B.heading * 0.75;

    const rate = B.rest > 0 ? 4.5 : 11;
    B.flap += dt * rate;

    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.012; p.vx *= 0.985;
      p.life -= dt * 0.7;
      if (p.life <= 0) petals.splice(i, 1);
    }
  }

  /* ----------------------------------------------------------------- draw */
  const MINT = '110,231,183', VIOLET = '167,139,250', GOLD = '251,191,36';

  function wingPath(sign, s) {
    // one wing pair: fore + hind, drawn as bezier petals
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(sign * 16 * s, -22 * s, sign * 34 * s, -16 * s, sign * 26 * s, -2 * s);
    ctx.bezierCurveTo(sign * 38 * s, 6 * s, sign * 26 * s, 22 * s, sign * 10 * s, 12 * s);
    ctx.bezierCurveTo(sign * 6 * s, 6 * s, sign * 3 * s, 2 * s, 0, 0);
    ctx.closePath();
  }

  function drawCreature(t) {
    const light = isLight();
    const s = 1.0;
    const flapX = 0.34 + Math.abs(Math.cos(B.flap)) * 0.66;

    ctx.save();
    ctx.translate(B.x, B.y);
    ctx.rotate(Math.sin(t * 0.7) * 0.12);

    // aura
    const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, 62);
    aura.addColorStop(0, `rgba(${MINT},${light ? 0.10 : 0.22})`);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.fill();

    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';

    for (const sign of [-1, 1]) {
      ctx.save();
      ctx.scale(sign * flapX, 1);
      const g = ctx.createLinearGradient(0, -20, 28, 16);
      g.addColorStop(0, `rgba(${MINT},0.92)`);
      g.addColorStop(0.55, `rgba(${VIOLET},0.82)`);
      g.addColorStop(1, `rgba(${GOLD},0.72)`);
      wingPath(1, s);
      ctx.fillStyle = g;
      ctx.shadowColor = `rgba(${MINT},${light ? 0.35 : 0.8})`;
      ctx.shadowBlur = light ? 8 : 20;
      ctx.fill();
      ctx.shadowBlur = 0;
      // wing veins
      ctx.strokeStyle = `rgba(${GOLD},${light ? 0.5 : 0.75})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(2, 0); ctx.quadraticCurveTo(18 * s, -8 * s, 30 * s, -2 * s);
      ctx.moveTo(2, 2); ctx.quadraticCurveTo(16 * s, 8 * s, 20 * s, 16 * s);
      ctx.stroke();
      ctx.restore();
    }

    // body
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = light ? '#2a2a26' : '#0d1a15';
    ctx.beginPath(); ctx.ellipse(0, 2, 2.4, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${MINT},0.9)`;
    ctx.beginPath(); ctx.arc(0, -9, 2.2, 0, Math.PI * 2); ctx.fill();

    // antennae
    ctx.strokeStyle = `rgba(${MINT},0.75)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1, -10); ctx.quadraticCurveTo(-7, -18, -11, -19);
    ctx.moveTo(1, -10); ctx.quadraticCurveTo(7, -18, 11, -19);
    ctx.stroke();
    ctx.fillStyle = `rgba(${GOLD},0.95)`;
    ctx.beginPath(); ctx.arc(-11, -19, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(11, -19, 1.5, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function drawPetals() {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of petals) {
      ctx.fillStyle = `rgba(${GOLD},${0.55 * p.life})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ----------------------------------------------------------------- loop */
  let last = performance.now(), raf = 0, running = false;

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    step(dt);
    ctx.clearRect(0, 0, W, H);
    drawPetals();
    drawCreature(now / 1000);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduce.matches) return;
    running = true; last = performance.now(); raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false; cancelAnimationFrame(raf);
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    drawCreature(0);
  }

  if (reduce.matches) {
    drawStatic();
    reduce.addEventListener('change', () => {
      if (reduce.matches) { stop(); drawStatic(); } else start();
    });
  } else {
    start();
  }

  // never animate an unwatched tab
  d.addEventListener('visibilitychange', () => {
    if (d.hidden) stop(); else if (!reduce.matches) start();
  });

  // the theme toggle rewrites colours; repaint once so light mode is correct
  addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#themeBtn, .swatch')) {
      setTimeout(() => { if (reduce.matches) drawStatic(); }, 60);
    }
  }, { passive: true });
})();
